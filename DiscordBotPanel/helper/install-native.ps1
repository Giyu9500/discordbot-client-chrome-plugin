param([string]$ExtensionId,[string]$Root)
$ErrorActionPreference = 'Stop'
try {
  $ExtensionId = $ExtensionId.Trim().ToLowerInvariant()
  if ($ExtensionId -notmatch '^[a-p]{32}$') { throw 'ID musi skladac sie z 32 liter od a do p. Znajdz je na chrome://extensions.' }
  $Root = (Resolve-Path -LiteralPath $Root).Path
  $Executable = Join-Path $Root 'helper\BotPanelHost.exe'
  if (-not (Test-Path -LiteralPath $Executable)) { throw 'Nie znaleziono helper\BotPanelHost.exe.' }
  $ManifestPath = Join-Path $Root 'helper\com.discordbotpanel.bridge.json'
  $Manifest = [ordered]@{
    name = 'com.discordbotpanel.bridge'
    description = 'Discord Bot Panel - uruchamiany tylko podczas otwartej karty'
    path = $Executable
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
  }
  $Manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
  # Windows PowerShell 5.1 encodes as UTF-8 BOM. Chrome JSON parser expects no BOM.
  [System.IO.File]::WriteAllText($ManifestPath, ($Manifest | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
  $Keys = @(
    'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.discordbotpanel.bridge',
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.discordbotpanel.bridge',
    'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.discordbotpanel.bridge'
  )
  foreach ($Key in $Keys) {
    New-Item -Path $Key -Force | Out-Null
    (Get-Item -LiteralPath $Key).SetValue('', $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String)
  }
  Write-Host ('Zarejestrowano autostart dla ID: ' + $ExtensionId) -ForegroundColor Green
  Write-Host 'Pomocnik uruchamia sie automatycznie po otwarciu karty i zatrzymuje po jej zamknieciu.'
  Write-Host 'Nie przenos folderu rozszerzenia po instalacji; sciezka jest zapisana w rejestrze.'
} catch {
  Write-Host ('BLAD: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
