import React from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          preload?: string
          httpreferrer?: string
          useragent?: string
          disablewebsecurity?: string | boolean
          partition?: string
          allowpopups?: string | boolean
          webpreferences?: string
          nodeintegration?: string | boolean
        },
        HTMLElement
      >
    }
  }
}
