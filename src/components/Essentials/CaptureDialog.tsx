import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, Copy, Crop, Download, Highlighter, Loader2, MoveUpRight, Pencil, Square, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Segmented, ToolFooter, ToolHeader, toolDialogClass } from '@/components/ui/tool-dialog'
import { api } from '@/lib/ipc'
import { useT } from '@/lib/i18n'
import { webContentsIdOf } from '@/lib/tabLifecycle'
import { activeTab } from './EssentialsRuntime'

type Tool = 'pen' | 'marker' | 'arrow' | 'box' | 'crop'
type Point = [x: number, y: number]
interface Shape {
  tool: Exclude<Tool, 'crop'>
  color: string
  points: Point[]
}
interface Area {
  x: number
  y: number
  width: number
  height: number
}

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#111827']
const TOOLS: Array<{ id: Tool; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'marker', label: 'Highlighter', icon: Highlighter },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { id: 'box', label: 'Rectangle', icon: Square },
  { id: 'crop', label: 'Crop', icon: Crop }
]

function areaOf(points: Point[], width: number, height: number): Area {
  const [a, b] = [points[0], points[points.length - 1]]
  const x = Math.max(0, Math.min(a[0], b[0]))
  const y = Math.max(0, Math.min(a[1], b[1]))
  return { x, y, width: Math.min(width, Math.max(a[0], b[0])) - x, height: Math.min(height, Math.max(a[1], b[1])) - y }
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, unit: number): void {
  const [first, last] = [s.points[0], s.points[s.points.length - 1]]
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = unit * (s.tool === 'marker' ? 14 : 3)
  if (s.tool === 'marker') ctx.globalAlpha = 0.35
  ctx.beginPath()
  if (s.tool === 'box') {
    ctx.rect(first[0], first[1], last[0] - first[0], last[1] - first[1])
  } else if (s.tool === 'arrow') {
    const angle = Math.atan2(last[1] - first[1], last[0] - first[0])
    const head = unit * 14
    ctx.moveTo(...first)
    ctx.lineTo(...last)
    for (const side of [-0.45, 0.45]) {
      ctx.moveTo(...last)
      ctx.lineTo(last[0] - head * Math.cos(angle + side), last[1] - head * Math.sin(angle + side))
    }
  } else {
    ctx.moveTo(...first)
    for (const p of s.points) ctx.lineTo(...p)
  }
  ctx.stroke()
  ctx.restore()
}

/** Ctrl+Shift+S: the visible page is copied right away, and can be marked up, cropped or saved */
export const CaptureDialog: React.FC = () => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'visible' | 'full'>('visible')
  const [busy, setBusy] = useState(false)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [name, setName] = useState('capture')
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [shapes, setShapes] = useState<Shape[]>([])
  const [crop, setCrop] = useState<Area | null>(null)
  const draft = useRef<{ tool: Tool; points: Point[] } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Ignores captures that finish after another one was started */
  const run = useRef(0)

  const capture = useCallback(async (which: 'visible' | 'full') => {
    const tab = activeTab()
    const wcId = webContentsIdOf(tab?.id)
    if (!tab || wcId === null) {
      toast.info('Open a web page first')
      return
    }
    const id = ++run.current
    setBusy(true)
    setMode(which)
    const res = which === 'full' ? await api.essentials.capture.fullPage(wcId) : await api.essentials.capture.visible(wcId)
    if (id !== run.current) return
    setBusy(false)
    if (!res.ok || !res.dataUrl) {
      toast.error(res.error || 'The page could not be captured')
      return
    }
    const img = new Image()
    img.src = res.dataUrl
    await img.decode().catch(() => {})
    if (id !== run.current) return
    setImage(img)
    setShapes([])
    setCrop(null)
    setName(tab.title || 'capture')
    setOpen(true)
    if ('truncated' in res && res.truncated) toast.info('This page is very long: only the first part was captured')
    if (which === 'visible' && (await api.essentials.capture.copy(res.dataUrl).catch(() => false))) toast.success(t('Copied to clipboard'))
  }, [t])

  useEffect(() => {
    const onCapture = (e: Event) => void capture((e as CustomEvent).detail === 'full' ? 'full' : 'visible')
    window.addEventListener('tct:web-capture', onCapture)
    return () => window.removeEventListener('tct:web-capture', onCapture)
  }, [capture])

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !image) return
    const unit = Math.max(1, image.naturalWidth / 1000)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)
    for (const s of shapes) drawShape(ctx, s, unit)
    const d = draft.current
    if (d && d.tool !== 'crop') drawShape(ctx, { tool: d.tool, color, points: d.points }, unit)
    const area = d?.tool === 'crop' ? areaOf(d.points, canvas.width, canvas.height) : crop
    if (area) {
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,.55)'
      ctx.beginPath()
      ctx.rect(0, 0, canvas.width, canvas.height)
      ctx.rect(area.x, area.y, area.width, area.height)
      ctx.fill('evenodd')
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = unit * 2
      ctx.strokeRect(area.x, area.y, area.width, area.height)
      ctx.restore()
    }
  }, [image, shapes, crop, color])

  useEffect(() => {
    // The canvas mounts with the dialog
    const id = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(id)
  }, [paint, open])

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]
  }
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = at(e)
    draft.current = { tool, points: [p, p] }
    paint()
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = draft.current
    if (!d) return
    if (d.tool === 'pen' || d.tool === 'marker') d.points.push(at(e))
    else d.points[1] = at(e)
    paint()
  }
  const onUp = () => {
    const d = draft.current
    const c = canvasRef.current
    draft.current = null
    if (!d || !c) return
    if (d.tool === 'crop') {
      const area = areaOf(d.points, c.width, c.height)
      setCrop(area.width > 8 && area.height > 8 ? area : null)
    } else {
      const kept = d.tool
      setShapes((s) => [...s, { tool: kept, color, points: d.points }])
    }
    paint()
  }

  /** Final picture: markings included, cropped */
  const render = (): string | null => {
    if (!image) return null
    const area = crop ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }
    const out = document.createElement('canvas')
    out.width = Math.round(area.width)
    out.height = Math.round(area.height)
    const ctx = out.getContext('2d')
    if (!ctx) return null
    ctx.translate(-area.x, -area.y)
    ctx.drawImage(image, 0, 0)
    for (const s of shapes) drawShape(ctx, s, Math.max(1, image.naturalWidth / 1000))
    return out.toDataURL('image/png')
  }
  const copy = async () => {
    const url = render()
    if (url && (await api.essentials.capture.copy(url))) toast.success(t('Copied to clipboard'))
    else toast.error('Could not copy the picture')
  }
  const save = async () => {
    const url = render()
    if (!url) return
    const res = await api.essentials.capture.save(url, name)
    if (res.ok && res.filePath) {
      const file = res.filePath
      toast.success('Saved', { description: file, action: { label: 'Show in Folder', onClick: () => void api.downloads.showInFolder(file) } })
    } else if (!res.canceled) toast.error(res.error || 'Could not save the picture')
  }
  const undo = () => (crop ? setCrop(null) : setShapes((s) => s.slice(0, -1)))

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setImage(null)
      }}
    >
      <DialogContent
        className={`${toolDialogClass} w-[94vw] max-w-5xl`}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return
          if (e.key === 'z') undo()
          else if (e.key === 'c') void copy()
          else return
          e.preventDefault()
        }}
      >
        <ToolHeader icon={Camera} title={t('Web capture')} description={name} TitleAs={DialogTitle} DescriptionAs={DialogDescription} />
        <div className="px-5 pb-3 flex flex-wrap items-center gap-3">
          <Segmented
            size="sm"
            value={mode}
            onChange={(m) => void capture(m)}
            options={[
              { value: 'visible', label: 'Visible area' },
              { value: 'full', label: 'Full page' }
            ]}
          />
          <div className="flex items-center gap-1" role="toolbar" aria-label="Drawing tools">
            {TOOLS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                title={label}
                aria-label={label}
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${tool === id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border border-border flex items-center justify-center ${color === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-popover' : ''}`}
                style={{ backgroundColor: c }}
              >
                {color === c && <Check className="w-3 h-3 text-white" />}
              </button>
            ))}
          </div>
          <button
            onClick={undo}
            disabled={!crop && shapes.length === 0}
            title={t('Undo')}
            aria-label={t('Undo')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        </div>
        <div className="relative mx-5 mb-4 rounded-xl border border-border bg-muted/40 overflow-auto max-h-[62vh]" data-lenis-prevent>
          {image && (
            <canvas
              ref={canvasRef}
              width={image.naturalWidth}
              height={image.naturalHeight}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="block w-full h-auto touch-none cursor-crosshair"
              aria-label={t('Web capture')}
            />
          )}
          {busy && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </div>
        <ToolFooter className="flex justify-end gap-2">
          <button onClick={() => void copy()} className="h-8 px-4 rounded-lg text-xs font-medium border border-border hover:bg-muted inline-flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> {t('Copy')}
          </button>
          <button onClick={() => void save()} className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> {t('Save')}
          </button>
        </ToolFooter>
      </DialogContent>
    </Dialog>
  )
}
