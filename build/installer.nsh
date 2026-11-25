; TCT Orbit — custom NSIS hooks (included via electron-builder.yml → nsis.include)
;
; On a normal uninstall, ask whether to also delete the user's browser data
; (history, bookmarks, passwords, extensions, settings). The default answer is No.
; Never runs during auto-updates (the old version is uninstalled silently with --updated)
; or silent uninstalls (/S), so updating never touches user data.

!macro customUnInstall
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "Do you also want to delete your TCT Orbit data?$\r$\n$\r$\nThis permanently removes your browsing history, bookmarks, saved passwords, extensions and settings from this PC.$\r$\n$\r$\nChoose No to keep them in case you reinstall TCT Orbit." \
      /SD IDNO IDNO orbit_keep_user_data

    ; Electron always stores data per user, even for an all-users install
    SetShellVarContext current

    ; One folder per release channel (shared/brand.ts → dataFolder), see electron/storage/paths.ts
    RMDir /r "$LOCALAPPDATA\TCTOrbit"
    RMDir /r "$LOCALAPPDATA\TCTOrbitNova"
    RMDir /r "$LOCALAPPDATA\TCTOrbitDeep"
    RMDir /r "$LOCALAPPDATA\TCTOrbitCanary"
    ; Older locations (leftovers if they were never moved)
    RMDir /r "$LOCALAPPDATA\TCT Orbit"
    RMDir /r "$LOCALAPPDATA\TCT Orbit Nova"
    RMDir /r "$LOCALAPPDATA\TCT Orbit Deep"
    RMDir /r "$LOCALAPPDATA\TCT Orbit Canary"
    RMDir /r "$LOCALAPPDATA\TCT\Orbit"
    RMDir /r "$LOCALAPPDATA\TCT\Orbit Nova"
    RMDir /r "$LOCALAPPDATA\TCT\Orbit Deep"
    RMDir /r "$LOCALAPPDATA\TCT\Orbit Canary"
    RMDir "$LOCALAPPDATA\TCT"
    RMDir /r "$LOCALAPPDATA\tct-orbit"
    RMDir /r "$LOCALAPPDATA\tct-orbit-nova"
    RMDir /r "$LOCALAPPDATA\tct-orbit-deep"
    RMDir /r "$LOCALAPPDATA\tct-orbit-canary"
    ; Older versions used %APPDATA% (Roaming); leftovers if they never moved
    RMDir /r "$APPDATA\tct-orbit"
    RMDir /r "$APPDATA\tct-orbit-nova"
    RMDir /r "$APPDATA\tct-orbit-deep"
    RMDir /r "$APPDATA\tct-orbit-canary"
    ; Folder named after the product (Electron's default before the app sets its own path)
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    ; Downloaded update packages
    RMDir /r "$LOCALAPPDATA\tct-orbit-updater"

    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}

    orbit_keep_user_data:
  ${EndIf}
!macroend
