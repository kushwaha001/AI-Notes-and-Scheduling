<#
  install-whisper-cache.ps1
  ----------------------------------------------------------------------------
  Installs the bundled faster-whisper model cache into THIS PC's HuggingFace
  cache with the correct  .cache\huggingface\hub  structure, so Whisper
  transcribes voice notes OFFLINE (no download) on the air-gapped app PC.

  Why a script: the #1 setup mistake is copying the files to the wrong level
  (missing the "hub" folder). This does it correctly and copies ONLY the
  Whisper models (skips the Docling models, which the app PC doesn't need).

  Run from this folder on the OFFLINE app PC:
      powershell -ExecutionPolicy Bypass -File .\install-whisper-cache.ps1
#>

$ErrorActionPreference = "Stop"

# 1) Find the source "hub" folder: a slim local copy first, else the full bundle.
$src = $null
if (Test-Path "$PSScriptRoot\hub") {
    $src = (Resolve-Path "$PSScriptRoot\hub").Path
} elseif (Test-Path "$PSScriptRoot\..\models\huggingface-cache\hub") {
    $src = (Resolve-Path "$PSScriptRoot\..\models\huggingface-cache\hub").Path
}
if (-not $src) {
    Write-Error "No source 'hub' found. Expected offline\whisper\hub or offline\models\huggingface-cache\hub."
    exit 1
}
Write-Host "Source hub : $src"

# 2) Destination HuggingFace cache (respects HF_HOME if you set one).
$hfHome = if ($env:HF_HOME) { $env:HF_HOME } else { "$env:USERPROFILE\.cache\huggingface" }
$dst    = Join-Path $hfHome "hub"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Write-Host "Destination: $dst"
Write-Host ""

# 3) Copy every Whisper model directory (matches *whisper*; skips Docling/etc).
$models = Get-ChildItem $src -Directory | Where-Object { $_.Name -like "*whisper*" }
if (-not $models) {
    Write-Error "No '*whisper*' model folders found under $src"
    exit 1
}
foreach ($m in $models) {
    Write-Host ("Copying {0} ..." -f $m.Name)
    robocopy $m.FullName (Join-Path $dst $m.Name) /E /NFL /NDL /NJH /NJS /NC /NS | Out-Null
}

# 4) Verify.
Write-Host ""
Write-Host "Installed Whisper model folders under the cache:"
Get-ChildItem $dst -Directory | Where-Object { $_.Name -like "*whisper*" } |
    ForEach-Object { Write-Host ("  - {0}" -f $_.Name) }
Write-Host ""
Write-Host "Done. Now set  OFFLINE_MODE=true  in backend\.env so Whisper uses ONLY this cache."
