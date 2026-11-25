/**
 * Terms of Use and Privacy Policy shown in the app (Settings → About, onboarding, command bar).
 *
 * Keep the Privacy Policy in sync with what the code actually does. If a feature starts sending
 * data anywhere new (an update server, crash reports, remote search suggestions ...), update the
 * "Connections TCT Orbit makes on its own" section and LEGAL_LAST_UPDATED in the same change.
 */

export const LEGAL_LAST_UPDATED = 'November 25, 2026'
export const LEGAL_PUBLISHER = 'TCT'
export const LEGAL_CONTACT_EMAIL = 'support@tctorbit.com'
export const LEGAL_WEBSITE = 'https://tctorbit.com'

export type LegalBlock = { p: string } | { list: string[] }

export interface LegalSection {
  heading: string
  blocks: LegalBlock[]
}

export interface LegalDocument {
  id: 'terms' | 'privacy'
  title: string
  intro: string
  sections: LegalSection[]
}

export const PRIVACY_POLICY: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  intro:
    'TCT Orbit is a desktop web browser that keeps your data on your own computer. We do not run user accounts, we do not collect analytics, telemetry or crash reports, and we cannot see what you browse. This policy explains what the browser stores, what it connects to, and the choices you have.',
  sections: [
    {
      heading: '1. Who we are',
      blocks: [
        {
          p: `TCT Orbit is published by ${LEGAL_PUBLISHER} ("we", "us"). You can reach us at ${LEGAL_CONTACT_EMAIL}. Because the browser does not send your browsing data to us, we are not able to access, sell or share it.`
        }
      ]
    },
    {
      heading: '2. Data stored on your computer',
      blocks: [
        { p: 'To work, TCT Orbit saves the following in its data folder on your device:' },
        {
          list: [
            'Spaces, open and pinned tabs, and browser settings.',
            'Browsing history, bookmarks and reading list, and Space notes.',
            'Your download list (the files themselves go to the folder you choose).',
            'Saved passwords and addresses, encrypted with your operating system account. Exported password files (.csv) are not encrypted.',
            'Page highlights, boosts (custom styles and hidden elements), link routing rules and keyboard shortcuts.',
            'Privacy settings, per-site permission choices (camera, microphone, location, notifications and similar), per-site zoom, and the counters behind the Privacy Report.',
            'Cookies, cache and site storage created by the websites you visit, as in any browser.',
            'Window size and position, and the ad-blocking filter lists.'
          ]
        },
        {
          p: 'Tab preview thumbnails are kept in memory only and are discarded when you quit. You can delete stored data at any time from History, Settings → Privacy & Shield ("Clear browsing data"), Settings → Site Settings, or by uninstalling the app and removing its data folder.'
        }
      ]
    },
    {
      heading: '3. Private tabs',
      blocks: [
        {
          p: 'Private tabs use a separate session that exists only in memory. Pages you visit in a private tab are not added to history, and their cookies, site storage, cache and permission choices are erased when the last private tab closes. Downloads and bookmarks you deliberately save from a private tab are kept. Private tabs do not hide your activity from the websites you visit, your network, your employer or your internet provider.'
        }
      ]
    },
    {
      heading: '4. Connections TCT Orbit makes on its own',
      blocks: [
        { p: 'Apart from the websites you open, the browser contacts these services:' },
        {
          list: [
            'Ad and tracker filter lists: downloaded from GitHub (raw.githubusercontent.com) about every three days. GitHub can see your IP address and that a TCT Orbit filter update was requested.',
            'Phishing and malware lists: downloaded from malware-filter.gitlab.io about every twelve hours (on by default). GitLab can see your IP address and that the list was requested. Addresses you visit are compared with the list on your computer and are not sent.',
            'Updates: the installed version asks GitHub Releases for a new version every few hours and downloads it (on by default, Settings → About). GitHub can see your IP address and the version requested. The Microsoft Store version is updated by the Store instead.',
            'Spelling dictionaries: downloaded once per language from Google servers when spell checking is on (the default, except on macOS, which uses its own dictionaries). What you type is checked on your computer.',
            '"Translate page" and "Translate selection": open Google Translate, only when you choose them. Google receives the page address or the selected text.',
            '"Create QR Code": sends the address to api.qrserver.com to draw the code, only when you choose it.',
            '"Ask this page": sends the page text to an Ollama model running on your own computer (127.0.0.1), only when you ask. It does not leave your computer through TCT Orbit.',
            'Encrypted DNS (DNS over HTTPS): when enabled (on by default), the names of the sites you visit are resolved through the provider you choose (Cloudflare by default, or Mullvad, Quad9 or AdGuard) instead of your internet provider. That provider handles those lookups under its own privacy policy.',
            'Your search engine: searches typed in the address bar or command bar are sent to the search engine you choose (DuckDuckGo by default). When search suggestions are on (Settings → Search Engine), what you type is also sent to that search engine; they are never used in private tabs.',
            'Site icons: to show a site icon in your tabs, bookmarks and settings, the browser may request it from that site.',
            '"Check my IP" (Settings → Privacy): contacts check.torproject.org, only when you press the button.',
            'A proxy or Tor connection, only if you configure one. That proxy can see the traffic it carries.'
          ]
        },
        {
          p: 'TCT Orbit does not include advertising, analytics or crash-reporting libraries, and Chromium’s own background services (sync, telemetry, crash uploads, component updates) are turned off.'
        }
      ]
    },
    {
      heading: '5. Encrypted sync file and backups',
      blocks: [
        {
          p: 'If you turn on the encrypted sync file or export a backup, the file is written to a location you choose. Sync files are encrypted on your computer with your passphrase (AES-256-GCM with an scrypt-derived key) before they are written; we never receive the file or the passphrase. If you keep the file in a cloud service such as OneDrive, Dropbox or iCloud Drive, that service stores the encrypted file under its own terms. Your passphrase is saved using your operating system’s secure storage so the file can update when you quit. Plain backup files (.json) are not encrypted. Keep them somewhere safe.'
        }
      ]
    },
    {
      heading: '6. Importing from other browsers',
      blocks: [
        {
          p: 'When you choose to import, TCT Orbit reads bookmarks and recent history from the other browser’s profile on your computer, or from a bookmarks file you select. The import happens entirely on your device; the other browser’s data is only read, never changed, and nothing is uploaded.'
        }
      ]
    },
    {
      heading: '7. Website permissions',
      blocks: [
        {
          p: 'Websites must ask before using your camera, microphone, location, notifications, clipboard or MIDI devices. Your answer is stored on your computer for that site, and you can change it in Settings → Site Settings. Screen sharing asks every time, and you choose the screen or window. Other sensitive device access (USB, serial, Bluetooth, HID and similar) is blocked.'
        }
      ]
    },
    {
      heading: '8. Websites you visit',
      blocks: [
        {
          p: 'Websites you visit receive information such as your IP address and anything you submit to them, and they handle it under their own privacy policies. TCT Orbit’s protections (ad and tracker blocking, third-party cookie blocking, fingerprinting resistance, HTTPS upgrades, Global Privacy Control) reduce tracking but cannot prevent every form of it.'
        }
      ]
    },
    {
      heading: '9. Children',
      blocks: [
        {
          p: 'TCT Orbit is a general-purpose browser and is not directed at children. We do not knowingly collect personal information from anyone, including children.'
        }
      ]
    },
    {
      heading: '10. Your choices and rights',
      blocks: [
        {
          p: 'Because your data stays on your device, you control it directly: you can view, export (Settings → Data & Backup), correct or delete it yourself. If you email us, we use your message and address only to answer you, and we delete the correspondence when it is no longer needed. Depending on where you live, you may have additional rights under data-protection law (such as the GDPR); contact us and we will help where we can.'
        }
      ]
    },
    {
      heading: '11. Security',
      blocks: [
        {
          p: 'Web pages run in a sandbox, separate from the browser interface and from your files. Atomic file writes protect your data from corruption. No software is perfectly secure, so keep your operating system and TCT Orbit up to date.'
        }
      ]
    },
    {
      heading: '12. Changes to this policy',
      blocks: [
        {
          p: 'If TCT Orbit starts handling data differently, we will update this policy and the "Last updated" date. Significant changes will be shown in the app before they take effect.'
        }
      ]
    },
    {
      heading: '13. Contact',
      blocks: [{ p: `Questions about privacy: ${LEGAL_CONTACT_EMAIL}.` }]
    }
  ]
}

export const TERMS_OF_USE: LegalDocument = {
  id: 'terms',
  title: 'Terms of Use',
  intro: `These terms apply to your use of the TCT Orbit browser published by ${LEGAL_PUBLISHER}. By installing or using TCT Orbit you agree to them. If you do not agree, please do not use the app.`,
  sections: [
    {
      heading: '1. License',
      blocks: [
        {
          p: 'TCT Orbit’s source code is released under the MIT License. That license governs your rights to use, copy, modify and distribute the code; nothing in these terms limits it. TCT Orbit includes third-party open-source components (including Chromium, Electron and the Ghostery ad-blocking engine), each under its own license. The TCT Orbit name and logo are not licensed for use in modified versions in a way that suggests they are official.'
        }
      ]
    },
    {
      heading: '2. Using TCT Orbit',
      blocks: [
        { p: 'You agree to use TCT Orbit lawfully. In particular, you will not use it to:' },
        {
          list: [
            'break the law, or infringe other people’s rights, including intellectual-property and privacy rights;',
            'gain unauthorized access to computers, accounts or networks, or interfere with their operation;',
            'distribute malware or carry out fraud, harassment or abuse.'
          ]
        },
        { p: 'You are responsible for the websites you visit, the content you access or download, and complying with those websites’ terms.' }
      ]
    },
    {
      heading: '3. Websites and third-party services',
      blocks: [
        {
          p: 'TCT Orbit displays content from websites and services that we do not control, including search engines, DNS providers and filter-list publishers. We are not responsible for their content, availability or practices. Blocking ads, trackers, cookies or scripts may cause some websites to work differently or not at all; you can turn protection off for individual sites.'
        }
      ]
    },
    {
      heading: '4. Privacy and security features',
      blocks: [
        {
          p: 'Privacy features such as private tabs, tracker blocking, fingerprinting resistance, encrypted DNS and proxy or Tor routing reduce tracking but do not make you anonymous and are not guaranteed to block every tracker or protect against every threat. Routing traffic through Tor with TCT Orbit does not provide the same protection as Tor Browser. If your safety depends on anonymity, use tools designed for that purpose.'
        }
      ]
    },
    {
      heading: '5. Your data and backups',
      blocks: [
        {
          p: 'Your browsing data is stored on your device and you are responsible for backing it up. Passphrases for encrypted sync files cannot be recovered by us; if you lose yours, the encrypted file cannot be opened. How your data is handled is described in the Privacy Policy.'
        }
      ]
    },
    {
      heading: '6. Pre-release versions',
      blocks: [
        {
          p: 'Canary, Nova and Deep builds are early versions for testing. They may contain bugs, change without notice or lose data, so keep backups if you use them.'
        }
      ]
    },
    {
      heading: '7. Changes and availability',
      blocks: [
        {
          p: 'We may change, suspend or stop developing TCT Orbit or any feature at any time. Because the app runs on your computer, it keeps working offline for local features, but online features depend on third-party services that may change.'
        }
      ]
    },
    {
      heading: '8. No warranty',
      blocks: [
        {
          p: 'TCT Orbit is provided "as is" and "as available", without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, non-infringement, or that it will be error-free or uninterrupted, to the fullest extent permitted by law.'
        }
      ]
    },
    {
      heading: '9. Limitation of liability',
      blocks: [
        {
          p: `To the fullest extent permitted by law, ${LEGAL_PUBLISHER} and the contributors to TCT Orbit are not liable for any indirect, incidental, special, consequential or punitive damages, or for loss of data, profits or goodwill, arising from your use of or inability to use TCT Orbit. Some jurisdictions do not allow these limitations, so they may not apply to you; nothing in these terms limits liability that cannot be limited by law, or your statutory rights as a consumer.`
        }
      ]
    },
    {
      heading: '10. Ending use',
      blocks: [
        {
          p: 'You can stop using TCT Orbit at any time by uninstalling it. Sections 3, 4, 5, 8, 9 and 11 continue to apply after you stop.'
        }
      ]
    },
    {
      heading: '11. Governing law',
      blocks: [
        {
          p: `These terms are governed by the laws of the jurisdiction in which ${LEGAL_PUBLISHER} is established, without regard to its conflict-of-law rules. If you are a consumer, you also keep the protection of mandatory laws of the country where you live.`
        }
      ]
    },
    {
      heading: '12. Changes to these terms',
      blocks: [
        {
          p: 'We may update these terms. The "Last updated" date shows when they last changed, and significant changes will be shown in the app. Continuing to use TCT Orbit after a change means you accept the updated terms.'
        }
      ]
    },
    {
      heading: '13. Contact',
      blocks: [{ p: `Questions about these terms: ${LEGAL_CONTACT_EMAIL}.` }]
    }
  ]
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [TERMS_OF_USE, PRIVACY_POLICY]
