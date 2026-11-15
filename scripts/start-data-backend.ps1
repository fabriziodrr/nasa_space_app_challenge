# Start Python with the same local demo profile credentials used by Next.js.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^\s*(AGENT_DEMO_TOKEN|AGENT_GROUND_TOKEN|AGENT_CREW_0[2-5]_TOKEN|AGENT_NODE_API_URL)\s*=\s*(.*?)\s*$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            if ($value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
        }
    }
}
$python = Join-Path $projectRoot 'server\.venv\Scripts\python.exe'
Push-Location (Join-Path $projectRoot 'server')
try { & $python -m uvicorn aegis_data.api:create_app --factory --host 127.0.0.1 --port 8000 }
finally { Pop-Location }
