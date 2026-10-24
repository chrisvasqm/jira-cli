# Install or update jira-cli to the latest release on Windows (PowerShell 5.1 or 7+):
#   irm https://raw.githubusercontent.com/chrisvasqm/jira-cli/main/install.ps1 | iex
# It downloads the release tarball, checks its SHA-256 against the release's checksum file,
# then installs it with npm. Source: https://github.com/chrisvasqm/jira-cli

# A script block keeps the variables out of the caller's session, and `throw` (not `exit`)
# keeps the window open when this runs through iex.
& {
  $ErrorActionPreference = "Stop"
  $ProgressPreference = "SilentlyContinue"
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $base = "https://github.com/chrisvasqm/jira-cli/releases/latest/download"

  function Fail([string]$message) { throw "jira-cli: $message" }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "needs Node.js 24 or newer; install it from https://nodejs.org" }
  $major = [int](node -p 'process.versions.node.split(".")[0]')
  if ($major -lt 24) { Fail "needs Node.js 24 or newer (found $(node -v)); update it from https://nodejs.org" }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "needs npm, which comes with Node.js" }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("jira-cli-" + [Guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $tarball = Join-Path $tmp "jira-cli.tgz"
    Write-Host "Downloading the latest jira-cli..."
    try { Invoke-WebRequest -UseBasicParsing -Uri "$base/jira-cli.tgz" -OutFile $tarball } catch { Fail "download failed: $($_.Exception.Message)" }

    $expected = $null
    try {
      $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/jira-cli.tgz.sha256").Content
      if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
      $expected = ($sums.Trim() -split '\s+')[0]
    } catch {
      Write-Warning "jira-cli: this release has no checksum file; skipping the checksum check"
    }
    if ($expected) {
      $actual = (Get-FileHash -Algorithm SHA256 -Path $tarball).Hash
      if ($actual -ne $expected) { Fail "checksum mismatch; the download was not installed" }
    }

    npm install -g $tarball | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed (see the error above)" }
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }

  if (Get-Command jira -ErrorAction SilentlyContinue) {
    Write-Host "Installed jira $(jira -v). Run 'jira setup' in your project directory to connect it to Jira."
  } else {
    Write-Host "Installed. Open a new terminal if 'jira' is not found, or add $(npm prefix -g) to your PATH."
  }
}
