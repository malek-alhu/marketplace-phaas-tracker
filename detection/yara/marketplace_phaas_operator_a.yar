/*
  Marketplace PhaaS "Operator A" — Next.js 16 client bundle (Classiscam/Telekopye-class kit).
  Source: literal strings from kit-source/decompressed/ (recovered from urlscan's public archive).
  Use for retro-hunting on web captures, proxy/CDN body logs, urlscan Pro or VirusTotal Livehunt.
  Reference: docs/kit-code-analysis.md, docs/operation-dossier.md §3A.
  TLP:CLEAR
*/

rule PhaaS_OperatorA_NextKit_Exfil_And_Stages
{
    meta:
        description = "Operator-A marketplace phishing kit JS chunk: card exfil WebSocket, fake-bank /viewer/ template, dev WS fallback or Russian builder strings"
        author      = "marketplace-phaas-tracker contributors"
        date        = "2026-09-30"
        reference   = "https://github.com/malek-alhu/marketplace-phaas-tracker"
        confidence  = "high"
        tlp         = "CLEAR"

    strings:
        $exfil      = "/api/ws/stripe/sync" ascii
        $viewer     = "/viewer/[TYPE_B64]/[SERVICE_METHOD]/[ADTAG]" ascii
        $devws      = "ws://localhost:5002" ascii
        $ru_panel   = "Панель настроек шаблона"
        $ru_decline = "Карта отклонена"

    condition:
        filesize < 5MB and any of them
}

rule PhaaS_OperatorA_NextKit_Helpdesk_Cluster
{
    meta:
        description = "Operator-A kit JS chunk: two or more co-occurring helpdesk/C2/cloak/BIN-lookup artefacts"
        author      = "marketplace-phaas-tracker contributors"
        date        = "2026-09-30"
        reference   = "https://github.com/malek-alhu/marketplace-phaas-tracker"
        confidence  = "medium"
        tlp         = "CLEAR"

    strings:
        $ws_help   = "/ws/helpdesk" ascii
        $ws_sync   = "/api/ws/sync" ascii
        $getws     = "getWsBaseUrl" ascii
        $geoip     = "api.ip.sb/geoip" ascii
        $binlist   = "lookup.binlist.net" ascii
        $simpals   = "v2.simpalsid.com/graphql" ascii
        $cg_logo   = "/static/cg.png" ascii
        $chat_snd  = "static/helpdesk/audio" ascii

    condition:
        filesize < 5MB and 2 of them
}
