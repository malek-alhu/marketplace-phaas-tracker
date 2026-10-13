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

rule PhaaS_OperatorA_NextKit_Operator_Control_Plane
{
    meta:
        description = "Operator-A kit JS chunk: server-push victim-steering protocol (ad:step / bank QR / permit_* switches) or scam-mode map"
        author      = "marketplace-phaas-tracker contributors"
        date        = "2026-10-13"
        reference   = "https://github.com/malek-alhu/marketplace-phaas-tracker/blob/main/docs/kit-code-analysis.md#6b-operator-control-plane--how-the-operator-drives-the-victims-page-h"
        confidence  = "high"
        tlp         = "CLEAR"

    strings:
        $qr_event   = "ad:change-lk-qrcode" ascii
        $ws_pay     = "[WS-PAY] failed to get ad" ascii
        $dbg_permit = "ad.variables.permit_bank" ascii
        $rl_verify  = "__verify_reload_" ascii
        $rl_login   = "__login_reload_" ascii
        $modes      = "mv:\"multiple_verify\",dp:\"dialog_push\"" ascii
        $rails      = "csdd_verify:\"csdd\",epaslaugos:\"epaslaugos\"" ascii
        $ru_store   = "useStore должен использоваться внутри StoreProvider"

    condition:
        filesize < 5MB and any of them
}

rule PhaaS_OperatorA_Next2_Kit_Build
{
    meta:
        description = "Operator-A 'next2' rebuild (Oct 2026): operator Sentry DSN (unmasked session replay via same-origin tunnel), Russian helpdesk error, multi-language verify-account lure, or the 3-provider geo-IP fallback"
        author      = "marketplace-phaas-tracker contributors"
        date        = "2026-10-13"
        reference   = "https://github.com/malek-alhu/marketplace-phaas-tracker/blob/main/docs/kit-code-analysis.md#6c-the-next2-rebuild-oct-2026--recovered-chunks-h"
        confidence  = "high"
        tlp         = "CLEAR"

    strings:
        $sentry_key = "e7c4fb44333c60d80e8b92cd94112a5a@tunnel" ascii
        $ru_hd_err  = "Ошибка helpdesk:"
        $lure_en    = "verify your account to release your payment" ascii
        $geo1       = "https://api.ipquery.io/" ascii
        $geo2       = "https://get.geojs.io/v1/ip/geo.json" ascii
        $geo3       = "https://reallyfreegeoip.org/json/" ascii

    condition:
        filesize < 5MB and ($sentry_key or $ru_hd_err or $lure_en or all of ($geo*))
}

rule PhaaS_OperatorA_Next2_Payment_Operator_Playbook
{
    meta:
        description = "Operator-A next2 payment module: per-victim Android APK delivery (fake 'Verified by Google Play'), Google number-matching takeover dialog, or operator dialog playbook"
        author      = "marketplace-phaas-tracker contributors"
        date        = "2026-10-13"
        reference   = "https://github.com/malek-alhu/marketplace-phaas-tracker/blob/main/docs/kit-code-analysis.md#6d-next2-payment-module-apk-delivery-and-the-operator-dialog-playbook-h"
        confidence  = "high"
        tlp         = "CLEAR"

    strings:
        $apk_prep   = "stripe/provider/download/prepare" ascii
        $apk_stream = "stripe/provider/download/stream" ascii
        $apk_gate   = "shouldAllowProviderApkDownload" ascii
        $apk_badge  = "dialog-apk.verified_badge" ascii
        $resolve    = "stripe/provider/resolve/" ascii
        $google_mm  = "Enter the number the victim must tap on their phone" ascii
        $bqr        = "/bqr/[RANDOM_ID]/[TYPE]/[SERVICE_METHOD]/[ADTAG]" ascii
        $ru_luhn    = "номер не проходит проверку Луна"

    condition:
        filesize < 5MB and any of them
}
