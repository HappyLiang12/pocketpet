<#
.SYNOPSIS
Read-only Windows acceptance probe for PocketPet.

.DESCRIPTION
Collects the evidence named by docs/acceptance/windows-support.md:
Windows version/architecture, Node version, config ACL entries via icacls,
the "PocketPet Bridge" scheduled task, the two PocketPet firewall rules,
loopback /health, and a multicast DNS query for the advertised .local name.

The probe never elevates, never writes a file, never reads config content,
and never prints the pairing token. Every check reports PASS, FAIL, or
NOT RUN with a short reason.

.PARAMETER Port
Bridge port to probe on 127.0.0.1. Defaults to 7788; pass the configured
port when it differs.

.PARAMETER Hostname
Optional .local name to query (for example "my-pc" or "my-pc.local").
Defaults to the live localHostname from /health, then the sanitized
COMPUTERNAME.

.PARAMETER NodePath
Optional node.exe path recorded by the installed launcher and firewall
rules (not the scheduled task action, which runs powershell.exe).
Defaults to node.exe on PATH.

.PARAMETER HomePath
Optional PocketPet home directory. Defaults to POCKETPET_HOME, then
%USERPROFILE%\.pocketpet. Only the path and its ACL are read.

Exits 1 when any gate is FAIL and 0 otherwise; NOT RUN alone exits 0.

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows-acceptance.ps1 -Port 7788
#>
[CmdletBinding()]
param(
  [int]$Port = 7788,
  [string]$Hostname = '',
  [string]$NodePath = '',
  [string]$HomePath = ''
)

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------------------
# Redaction: evidence may be pasted into the acceptance record. Hide the
# profile path and account name, but never print config content or the token.
# ---------------------------------------------------------------------------
$script:Redactions = @()
$script:ProfilePlaceholder = '__POCKETPET_PROFILE_PATH__'
if ($env:USERPROFILE) { $script:Redactions += @{ Value = $env:USERPROFILE; Label = $script:ProfilePlaceholder } }
if ($env:USERNAME) { $script:Redactions += @{ Value = $env:USERNAME; Label = '<user>' } }

function Hide-Text {
  param([string]$Text)
  if ([string]::IsNullOrEmpty($Text)) { return '' }
  $result = $Text
  foreach ($item in $script:Redactions) {
    $result = $result -replace [regex]::Escape($item.Value), $item.Label
  }
  # Replace the profile path before the account name so the final placeholder
  # does not get rewritten to %<user>PROFILE%.
  return $result.Replace($script:ProfilePlaceholder, '%USERPROFILE%')
}

function New-Gate {
  param([string]$Name, [string]$Result, [string]$Detail)
  return [pscustomobject]@{
    gate = $Name
    result = $Result
    detail = (Hide-Text $Detail)
  }
}

# Generic lists are created with ::new(); New-Object on a generic List and
# wrapping it in @() throws "Argument types do not match" on Windows
# PowerShell 5.1 and pwsh 7.6, which aborted the probe before it printed JSON.
# Output is serialized with .ToArray() instead of @($list).
$gates = [System.Collections.Generic.List[object]]::new()

# ---------------------------------------------------------------------------
# Host: Windows version, build, architecture, PowerShell.
# ---------------------------------------------------------------------------
$osName = 'Windows'
$osVersion = ''
$osBuild = 0
$osCaption = ''
$osDisplayVersion = ''
try {
  $key = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction Stop
  $osBuild = [int]$key.CurrentBuildNumber
  $osCaption = [string]$key.ProductName
  $osDisplayVersion = [string]$key.DisplayVersion
  $osVersion = ('{0}.{1}' -f [string]$key.CurrentVersion, $osBuild)
  if ($osCaption -match 'Server') { $osName = 'Windows Server' }
  elseif ($osBuild -ge 22000) { $osName = 'Windows 11' }
  elseif ($osBuild -gt 0) { $osName = 'Windows 10' }
} catch {
  $osVersion = [string][System.Environment]::OSVersion.Version
  $osBuild = [int][System.Environment]::OSVersion.Version.Build
  if ($osBuild -ge 22000) { $osName = 'Windows 11' }
  elseif ($osBuild -gt 0) { $osName = 'Windows 10' }
}
$arch = ''
try { $arch = [string][System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture } catch { $arch = '' }
if (-not $arch -or $arch -eq 'Unknown') { $arch = [string]$env:PROCESSOR_ARCHITECTURE }
if ($arch -eq 'X64') { $arch = 'AMD64' }

$hostInfo = [ordered]@{
  os = $osName
  # Registry ProductName is kept for diagnostics only; Windows 11 can still
  # report "Windows 10 ..." here. Judge the host by the build number above.
  registryProductName = (Hide-Text $osCaption)
  displayVersion = $osDisplayVersion
  version = $osVersion
  build = $osBuild
  architecture = $arch
  powershell = $PSVersionTable.PSVersion.ToString()
}

if ($osName -eq 'Windows 11' -and $arch -eq 'AMD64') {
  $gates.Add((New-Gate 'host' 'PASS' "Windows 11 x64 (build $osBuild) is the official Windows host"))
} elseif ($osName -eq 'Windows 10') {
  $gates.Add((New-Gate 'host' 'NOT RUN' "Windows 10 build $osBuild is compatibility-only; this run is not the official Windows 11 x64 gate"))
} else {
  $gates.Add((New-Gate 'host' 'FAIL' "unsupported host: $osName $arch; only Windows 11 x64 is officially supported"))
}

# ---------------------------------------------------------------------------
# Node: version and executable path (redacted).
# ---------------------------------------------------------------------------
$nodeExe = ''
$nodeVersion = ''
if ($NodePath) {
  $nodeExe = $NodePath
} else {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1 }
  if ($nodeCommand) { $nodeExe = [string]$nodeCommand.Source }
}
if ($nodeExe) {
  try {
    $nodeVersion = [string](& $nodeExe --version 2>$null | Select-Object -First 1)
    $nodeVersion = $nodeVersion.Trim()
  } catch {
    $nodeVersion = ''
  }
}

$nodeOk = $false
if ($nodeVersion -match '^v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)') {
  $nodeMajor = [int]$Matches['major']
  $nodeMinor = [int]$Matches['minor']
  $nodeOk = ($nodeMajor -gt 20) -or ($nodeMajor -eq 20 -and $nodeMinor -ge 6)
}
if (-not $nodeVersion) {
  $gates.Add((New-Gate 'node' 'FAIL' 'node.exe was not found on PATH; pass -NodePath'))
} elseif ($nodeOk) {
  $gates.Add((New-Gate 'node' 'PASS' "$nodeVersion (minimum v20.6.0)"))
} else {
  $gates.Add((New-Gate 'node' 'FAIL' "$nodeVersion is below the required v20.6.0"))
}

# ---------------------------------------------------------------------------
# Config ACL: path existence plus icacls entries. No file content is read.
# ---------------------------------------------------------------------------
$homeDir = $HomePath
if (-not $homeDir) { $homeDir = [string]$env:POCKETPET_HOME }
if (-not $homeDir -and $env:USERPROFILE) { $homeDir = Join-Path $env:USERPROFILE '.pocketpet' }
if ($homeDir) { $homeDir = $homeDir.TrimEnd('\', '/') }

$currentSid = ''
try { $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value } catch { $currentSid = '' }

function Resolve-PrincipalSid {
  param([string]$Principal)
  if (-not $Principal) { return '' }
  try {
    if ($Principal -match '^S-1-5-') { return $Principal }
    $account = New-Object -TypeName System.Security.Principal.NTAccount -ArgumentList $Principal
    return $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
  } catch {
    return ''
  }
}

function Test-ProtectedPath {
  param([string]$Path, [string]$Label, [bool]$Required)

  $state = [pscustomobject]@{
    label = $Label
    path = (Hide-Text $Path)
    exists = $false
    protected = $false
    result = 'NOT RUN'
    detail = ''
    entries = @()
  }

  if (-not $Path) {
    $state.detail = 'home path is unknown; pass -HomePath'
    return $state
  }
  if (-not (Test-Path -LiteralPath $Path)) {
    $state.detail = 'not found'
    if ($Required) { $state.result = 'FAIL' }
    return $state
  }
  $state.exists = $true

  $raw = & icacls.exe $Path 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    $state.result = 'FAIL'
    $state.detail = "icacls exited $code; the ACL could not be read"
    return $state
  }

  $entries = [System.Collections.Generic.List[object]]::new()
  foreach ($lineValue in @($raw)) {
    $line = [string]$lineValue
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $clean = ($line -replace [regex]::Escape($Path), '').Trim()
    if (-not $clean) { continue }
    if ($clean -match '^(?<principal>.+?):(?<flags>(?:\([^)]+\))+)$') {
      $principal = $Matches['principal'].Trim()
      $flags = $Matches['flags']
      $entries.Add([pscustomobject]@{
        principal = $principal
        flags = $flags
        inherited = ($flags -match '\(I\)')
        deny = ($flags -match '\(DENY\)')
      })
    }
  }

  $state.entries = @($entries.ToArray() | ForEach-Object {
    [pscustomobject]@{ principal = (Hide-Text $_.principal); flags = $_.flags }
  })

  $protectedFlag = $null
  try {
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    $protectedFlag = [bool]$acl.AreAccessRulesProtected
  } catch {
    $protectedFlag = $null
  }

  $reasons = [System.Collections.Generic.List[string]]::new()
  if ($entries.Count -eq 0) { $reasons.Add('no ACL entry') | Out-Null }
  if ($entries.Count -gt 1) { $reasons.Add("$($entries.Count) ACL entries") | Out-Null }
  if ($protectedFlag -eq $false) { $reasons.Add('inheritance is still enabled') | Out-Null }
  $inherited = @($entries.ToArray() | Where-Object { $_.inherited }).Count
  $denied = @($entries.ToArray() | Where-Object { $_.deny }).Count
  if ($inherited -gt 0) { $reasons.Add("$inherited inherited entries") | Out-Null }
  if ($denied -gt 0) { $reasons.Add('a deny entry exists') | Out-Null }

  $belongs = $false
  if ($entries.Count -eq 1) {
    $sid = Resolve-PrincipalSid $entries[0].principal
    if ($currentSid -and $sid -eq $currentSid) {
      $belongs = $true
    } elseif ($env:USERNAME -and $entries[0].principal -like "*$($env:USERNAME)*") {
      $belongs = $true
    }
  }
  if (-not $belongs) { $reasons.Add('the single entry is not the current user') | Out-Null }

  if ($reasons.Count -eq 0) {
    $state.protected = $true
    $state.result = 'PASS'
    $state.detail = 'one current-user ACE; inheritance removed'
  } else {
    $state.result = 'FAIL'
    $state.detail = ($reasons -join '; ')
  }
  return $state
}

$protected = [System.Collections.Generic.List[object]]::new()
if ($homeDir) {
  $protected.Add((Test-ProtectedPath -Path $homeDir -Label 'home' -Required $true))
  $protected.Add((Test-ProtectedPath -Path (Join-Path $homeDir 'config.json') -Label 'config' -Required $true))
  $protected.Add((Test-ProtectedPath -Path (Join-Path $homeDir 'logs') -Label 'logs' -Required $false))
  $protected.Add((Test-ProtectedPath -Path (Join-Path $homeDir 'bridge-service.ps1') -Label 'launcher' -Required $false))
}

$configGate = 'PASS'
$configDetail = 'home and config are current-user-only'
if (-not $homeDir) {
  $configGate = 'NOT RUN'
  $configDetail = 'home path is unknown; pass -HomePath'
} else {
  $failed = @($protected.ToArray() | Where-Object { $_.result -eq 'FAIL' })
  $configMissing = @($protected.ToArray() | Where-Object { $_.label -eq 'config' -and -not $_.exists }).Count -gt 0
  if ($configMissing) {
    $configGate = 'FAIL'
    $configDetail = 'config.json is missing; run `pocketpet up` first (the probe never reads its content)'
  } elseif ($failed.Count -gt 0) {
    $configGate = 'FAIL'
    $configDetail = (($failed | ForEach-Object { "$($_.label): $($_.detail)" }) -join '; ')
  } else {
    $configDetail = 'home and config are current-user-only; logs/launcher verified when present'
  }
}
$gates.Add((New-Gate 'config ACL' $configGate $configDetail))

# ---------------------------------------------------------------------------
# Scheduled task: locale-independent State via Get-ScheduledTask. This is the
# same signal as `service status`; Get-ScheduledTaskInfo last result/run time
# is probe/diagnostic evidence only, not part of the product status.
# ---------------------------------------------------------------------------
$serviceInfo = [ordered]@{
  task = 'PocketPet Bridge'
  installed = $false
  state = ''
  lastTaskResult = $null
  lastRunTime = $null
}
$serviceGate = 'NOT RUN'
$serviceDetail = 'Get-ScheduledTask is unavailable'
if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
  try {
    $tasks = @(Get-ScheduledTask -TaskName 'PocketPet Bridge' -ErrorAction SilentlyContinue | Where-Object { $_ })
    if ($tasks.Count -eq 0) {
      $serviceGate = 'FAIL'
      $serviceDetail = 'the PocketPet Bridge task is missing or unreadable; run `pocketpet service install`'
    } else {
      $task = $tasks[0]
      $serviceInfo.installed = $true
      $serviceInfo.state = [string]$task.State
      try {
        $taskInfo = Get-ScheduledTaskInfo -TaskName 'PocketPet Bridge' -ErrorAction Stop
        $serviceInfo.lastTaskResult = $taskInfo.LastTaskResult
        $serviceInfo.lastRunTime = [string]$taskInfo.LastRunTime
      } catch { }
      if ($serviceInfo.state -eq 'Running') {
        $serviceGate = 'PASS'
        $serviceDetail = 'Task Scheduler state is Running'
      } else {
        $serviceGate = 'FAIL'
        $serviceDetail = "Task Scheduler state is '$($serviceInfo.state)' (expected Running)"
      }
    }
  } catch {
    $serviceGate = 'FAIL'
    $serviceDetail = 'the PocketPet Bridge task could not be queried'
  }
} elseif (Get-Command schtasks.exe -ErrorAction SilentlyContinue) {
  $serviceGate = 'NOT RUN'
  $serviceDetail = 'Get-ScheduledTask is unavailable; run `schtasks /Query /TN "PocketPet Bridge" /FO LIST /V` manually'
}
$gates.Add((New-Gate 'scheduled task' $serviceGate $serviceDetail))

# ---------------------------------------------------------------------------
# Firewall: rule content, profile, protocol, port, and program scope.
# ---------------------------------------------------------------------------
$firewallInfo = [ordered]@{
  rules = @()
  netshOnly = @()
}
$firewallGate = 'NOT RUN'
$firewallDetail = 'Get-NetFirewallRule is unavailable'
function Test-NetshFirewallRulePresent {
  param([string]$Name)
  try {
    $text = (& netsh.exe advfirewall firewall show rule "name=$Name" 2>$null) -join "`n"
    if ($LASTEXITCODE -ne 0) { return $false }
    return ($text -match [regex]::Escape($Name))
  } catch {
    return $false
  }
}
if (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) {
  $expectedRules = @(
    @{ Name = 'PocketPet Bridge TCP'; Protocol = 'TCP'; LocalPort = [string]$Port },
    @{ Name = 'PocketPet Bridge mDNS'; Protocol = 'UDP'; LocalPort = '5353' }
  )
  $issues = [System.Collections.Generic.List[string]]::new()
  $ruleInfo = [System.Collections.Generic.List[object]]::new()
  $netshOnly = [System.Collections.Generic.List[string]]::new()
  try {
    foreach ($expected in $expectedRules) {
      $rules = @(Get-NetFirewallRule -DisplayName $expected.Name -ErrorAction SilentlyContinue | Where-Object { $_ })
      if ($rules.Count -eq 0) {
        # A non-admin token can make the NetSecurity cmdlet return no rules even
        # when netsh can see them. Existence via netsh is NOT RUN, never a false
        # "missing" FAIL; content still needs an elevated read or the phone test.
        if (Test-NetshFirewallRulePresent $expected.Name) {
          $netshOnly.Add($expected.Name) | Out-Null
          continue
        }
        $issues.Add("$($expected.Name) is missing") | Out-Null
        continue
      }
      if ($rules.Count -gt 1) { $issues.Add("$($expected.Name) is duplicated") | Out-Null }
      $rule = $rules[0]
      $portFilter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue
      $appFilter = Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue
      $profile = [string]$rule.Profile
      $protocol = [string]$portFilter.Protocol
      $localPort = (@($portFilter.LocalPort) -join ',')
      $program = [string]$appFilter.Program
      $ruleInfo.Add([pscustomobject]@{
        name = [string]$rule.DisplayName
        enabled = [string]$rule.Enabled
        direction = [string]$rule.Direction
        action = [string]$rule.Action
        profile = $profile
        protocol = $protocol
        localPort = $localPort
        program = (Hide-Text $program)
      }) | Out-Null
      if ($rule.Enabled -ne 'True') { $issues.Add("$($expected.Name) is disabled") | Out-Null }
      if ($rule.Direction -ne 'Inbound') { $issues.Add("$($expected.Name) is not inbound") | Out-Null }
      if ($rule.Action -ne 'Allow') { $issues.Add("$($expected.Name) does not allow traffic") | Out-Null }
      if ([int]$rule.Profile -ne 2) { $issues.Add("$($expected.Name) is not Private-profile only") | Out-Null }
      if ($protocol -ne $expected.Protocol) { $issues.Add("$($expected.Name) has protocol '$protocol'") | Out-Null }
      if (@($portFilter.LocalPort) -notcontains $expected.LocalPort) {
        $issues.Add("$($expected.Name) has local port '$localPort'") | Out-Null
      }
      if (-not $program -or $program -eq 'Any') {
        $issues.Add("$($expected.Name) has no program scope") | Out-Null
      } elseif ($nodeExe) {
        if ($program -ne $nodeExe) {
          $issues.Add("$($expected.Name) is scoped to a different program") | Out-Null
        }
      } else {
        $issues.Add("$($expected.Name) program scope could not be compared because node.exe was not resolved; pass -NodePath") | Out-Null
      }
    }
    $firewallInfo.rules = $ruleInfo.ToArray()
    $firewallInfo.netshOnly = $netshOnly.ToArray()
    if ($issues.Count -eq 0 -and $netshOnly.Count -eq 0) {
      $firewallGate = 'PASS'
      $firewallDetail = "Private-profile inbound allow rules verified for TCP $Port and mDNS UDP 5353"
    } elseif ($issues.Count -eq 0) {
      $firewallGate = 'NOT RUN'
      $firewallDetail = "NetSecurity returned no rule content for this non-admin token; netsh shows $($netshOnly -join ', '). Verify content with an elevated Get-NetFirewallRule and the phone test."
    } else {
      $firewallGate = 'FAIL'
      $firewallDetail = ($issues -join '; ')
      if ($netshOnly.Count -gt 0) {
        $firewallDetail += "; netsh shows $($netshOnly -join ', ') but their content was unreadable"
      }
    }
  } catch {
    $firewallGate = 'NOT RUN'
    $firewallDetail = 'the NetSecurity cmdlets could not read the PocketPet rules'
  }
}
$gates.Add((New-Gate 'firewall' $firewallGate $firewallDetail))

# ---------------------------------------------------------------------------
# Loopback health: token-free; the response carries no secret.
# ---------------------------------------------------------------------------
$healthInfo = [ordered]@{
  url = "http://127.0.0.1:$Port/health"
  httpStatus = $null
  ok = $false
  localHostname = $null
}
$healthGate = 'FAIL'
$healthDetail = "no response on port $Port"
$liveHostname = $null
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3 -ErrorAction Stop
  $healthInfo.httpStatus = [int]$response.StatusCode
  if ($response.StatusCode -eq 200) {
    $healthGate = 'PASS'
    $healthDetail = 'loopback /health answered 200 without a token'
    $healthInfo.ok = $true
    try {
      $body = $response.Content | ConvertFrom-Json
      if ($body.PSObject.Properties.Name -contains 'localHostname' -and $body.localHostname) {
        $liveHostname = [string]$body.localHostname
      }
    } catch { }
  } else {
    $healthDetail = "unexpected HTTP status $($response.StatusCode)"
  }
} catch {
  $healthDetail = "no healthy bridge on 127.0.0.1:$Port; run pocketpet up or pocketpet run"
}
$healthInfo.localHostname = $liveHostname
$gates.Add((New-Gate 'loopback health' $healthGate $healthDetail))

# ---------------------------------------------------------------------------
# mDNS: direct multicast A query, then the system resolver as a fallback.
# No token is sent or printed. The phone-side gate remains authoritative.
# ---------------------------------------------------------------------------
function ConvertTo-DnsLabel {
  param([string]$Name)
  $label = $Name.Trim().ToLowerInvariant()
  if ($label.EndsWith('.local')) { $label = $label.Substring(0, $label.Length - 6) }
  $label = $label -replace '[^a-z0-9-]+', '-'
  $label = $label -replace '-+', '-'
  $label = $label.Trim('-')
  if ($label.Length -gt 63) { $label = $label.Substring(0, 63).Trim('-') }
  if (-not $label) { $label = 'pocketpet' }
  return $label
}

function Read-DnsName {
  param([byte[]]$Packet, [int]$Offset)
  $labels = [System.Collections.Generic.List[string]]::new()
  $position = $Offset
  $next = $Offset
  $jumped = $false
  $guard = 0
  while ($true) {
    $guard++
    if ($guard -gt 128 -or $position -ge $Packet.Length) { break }
    $length = [int]$Packet[$position]
    if ($length -eq 0) {
      $position++
      if (-not $jumped) { $next = $position }
      break
    }
    if (($length -band 0xC0) -eq 0xC0) {
      if ($position + 1 -ge $Packet.Length) { break }
      $pointer = ((($length -band 0x3F) -shl 8) -bor [int]$Packet[$position + 1])
      if (-not $jumped) { $next = $position + 2 }
      $jumped = $true
      $position = $pointer
      continue
    }
    if ($position + 1 + $length -gt $Packet.Length) { break }
    $labels.Add([System.Text.Encoding]::ASCII.GetString($Packet, $position + 1, $length))
    $position += 1 + $length
  }
  return [pscustomobject]@{ Name = ($labels -join '.'); Next = $next }
}

function Get-MdnsAnswers {
  param([byte[]]$Packet, [string]$Name)
  $answers = [System.Collections.Generic.List[string]]::new()
  if ($Packet.Length -lt 12) { return $answers.ToArray() }
  $questions = ([int]$Packet[4] * 256) + [int]$Packet[5]
  $records = ([int]$Packet[6] * 256) + [int]$Packet[7]
  $offset = 12
  for ($i = 0; $i -lt $questions; $i++) {
    $question = Read-DnsName -Packet $Packet -Offset $offset
    $offset = $question.Next + 4
  }
  for ($i = 0; $i -lt $records; $i++) {
    $record = Read-DnsName -Packet $Packet -Offset $offset
    $offset = $record.Next
    if ($offset + 10 -gt $Packet.Length) { break }
    $type = ([int]$Packet[$offset] * 256) + [int]$Packet[$offset + 1]
    $length = ([int]$Packet[$offset + 8] * 256) + [int]$Packet[$offset + 9]
    $offset += 10
    if ($type -eq 1 -and $length -eq 4 -and $record.Name -ieq $Name -and ($offset + 4) -le $Packet.Length) {
      $address = '{0}.{1}.{2}.{3}' -f [int]$Packet[$offset], [int]$Packet[$offset + 1], [int]$Packet[$offset + 2], [int]$Packet[$offset + 3]
      if (-not $answers.Contains($address)) { $answers.Add($address) }
    }
    $offset += $length
  }
  return $answers.ToArray()
}

function Resolve-MdnsDirect {
  param([string]$Name, [int]$TimeoutMs = 2500)
  $target = $Name.ToLowerInvariant()
  $udp = New-Object System.Net.Sockets.UdpClient
  try {
    $udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
    $udp.ExclusiveAddressUse = $false
    $bind = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 5353)
    $udp.Client.Bind($bind)
    $udp.JoinMulticastGroup([System.Net.IPAddress]::Parse('224.0.0.251'))

    $stream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter($stream)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([byte]0); $writer.Write([byte]1)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([byte]0); $writer.Write([byte]0)
    foreach ($label in $target.Split('.')) {
      $bytes = [System.Text.Encoding]::ASCII.GetBytes($label)
      $writer.Write([byte]$bytes.Length)
      $writer.Write($bytes)
    }
    $writer.Write([byte]0)
    $writer.Write([byte]0); $writer.Write([byte]1)
    $writer.Write([byte]0); $writer.Write([byte]1)
    $writer.Flush()
    $query = $stream.ToArray()

    $endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse('224.0.0.251'), 5353)
    $null = $udp.Send($query, $query.Length, $endpoint)

    $answers = [System.Collections.Generic.List[string]]::new()
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
      if (-not $udp.Client.Poll(100000, [System.Net.Sockets.SelectMode]::Read)) { continue }
      $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
      $data = $udp.Receive([ref]$remote)
      foreach ($address in (Get-MdnsAnswers -Packet $data -Name $target)) {
        if (-not $answers.Contains($address)) { $answers.Add($address) }
      }
      if ($answers.Count -gt 0) { break }
    }
    return $answers.ToArray()
  } finally {
    $udp.Close()
  }
}

$mdnsName = ''
if ($Hostname) {
  $mdnsName = ConvertTo-DnsLabel $Hostname
} elseif ($liveHostname) {
  $mdnsName = ConvertTo-DnsLabel $liveHostname
} elseif ($env:COMPUTERNAME) {
  $mdnsName = ConvertTo-DnsLabel $env:COMPUTERNAME
}
$mdnsTarget = if ($mdnsName) { "$mdnsName.local" } else { '' }

$mdnsInfo = [ordered]@{
  name = $mdnsTarget
  method = ''
  addresses = @()
}
$mdnsGate = 'NOT RUN'
$mdnsDetail = 'no hostname is available; pass -Hostname'
if ($mdnsTarget) {
  $direct = $null
  $directError = ''
  $systemAnswers = @()
  try {
    $direct = @(Resolve-MdnsDirect -Name $mdnsTarget -TimeoutMs 2500)
  } catch {
    $directError = $_.Exception.Message
  }
  if (Get-Command Resolve-DnsName -ErrorAction SilentlyContinue) {
    try {
      $systemAnswers = @(Resolve-DnsName -Name $mdnsTarget -Type A -QuickTimeout -ErrorAction Stop |
        Where-Object { $_.IPAddress } | ForEach-Object { [string]$_.IPAddress })
    } catch { }
  }

  if ($null -ne $direct -and $direct.Count -gt 0) {
    $mdnsInfo.method = 'direct multicast query'
    $mdnsInfo.addresses = @($direct)
  } elseif ($systemAnswers.Count -gt 0) {
    $mdnsInfo.method = 'system resolver (indicative)'
    $mdnsInfo.addresses = @($systemAnswers)
  }

  if (-not $liveHostname) {
    # A resolver answer from another host or a stale cache is not this bridge.
    $mdnsGate = 'NOT RUN'
    $mdnsDetail = 'bridge advertised no .local name (health localHostname is null); service/firewall are not running'
    if ($systemAnswers.Count -gt 0) {
      $mdnsDetail += "; system resolver answered, but that answer is not attributed to this bridge"
    } elseif ($null -ne $direct -and $direct.Count -gt 0) {
      $mdnsDetail += '; multicast answered, but that answer is not attributed to this bridge'
    }
  } elseif ($null -ne $direct -and $direct.Count -gt 0) {
    $mdnsGate = 'PASS'
    $mdnsDetail = "multicast A query answered $mdnsTarget; bridge advertised $liveHostname"
  } elseif ($systemAnswers.Count -gt 0) {
    # The bridge advertises, but only the system resolver answered. The phone
    # gate is authoritative; do not count this as a .local PASS.
    $mdnsGate = 'NOT RUN'
    $mdnsDetail = "system resolver answered $mdnsTarget; no direct multicast answer, so verify from the phone (authoritative gate)"
  } elseif ($null -eq $direct) {
    $mdnsGate = 'NOT RUN'
    $mdnsDetail = "mDNS query could not run: $(Hide-Text $directError)"
  } else {
    $mdnsGate = 'FAIL'
    $mdnsDetail = "bridge advertised $liveHostname but no A answer for $mdnsTarget within 2.5s; check Private network, firewall rules, multicast, and IP/USB fallback (same-host probes can be filtered; verify from the phone)"
  }
}
$gates.Add((New-Gate 'mdns .local' $mdnsGate $mdnsDetail))

# ---------------------------------------------------------------------------
# Summary and JSON output.
# ---------------------------------------------------------------------------
$summary = [ordered]@{ 'PASS' = 0; 'FAIL' = 0; 'NOT RUN' = 0 }
foreach ($gate in $gates) {
  if ($summary.Contains($gate.result)) { $summary[$gate.result] = $summary[$gate.result] + 1 }
}

$result = [ordered]@{
  tool = 'pocketpet-windows-acceptance'
  schema = 1
  readOnly = $true
  generatedAt = (Get-Date).ToString('o')
  host = $hostInfo
  node = [ordered]@{
    version = $nodeVersion
    path = (Hide-Text $nodeExe)
    minimum = 'v20.6.0'
  }
  config = [ordered]@{
    home = (Hide-Text $homeDir)
    exists = [bool]($homeDir -and (Test-Path -LiteralPath $homeDir))
    paths = $protected.ToArray()
  }
  service = $serviceInfo
  firewall = $firewallInfo
  bridge = $healthInfo
  mdns = $mdnsInfo
  summary = $summary
  gates = $gates.ToArray()
}

$result | ConvertTo-Json -Depth 8

# A FAIL is actionable evidence and must be visible to scripts. NOT RUN alone
# is a normal pre-install state and keeps exit 0.
if ($summary['FAIL'] -gt 0) { exit 1 }
exit 0
