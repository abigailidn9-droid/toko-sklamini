use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct WinScanner {
    pub id: String,
    pub name: String,
    pub kind: String,
}

#[tauri::command]
pub fn list_scanners() -> Result<Vec<WinScanner>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_list_scanners()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[cfg(target_os = "windows")]
fn windows_list_scanners() -> Result<Vec<WinScanner>, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out = New-Object System.Collections.Generic.List[object]
$seen = @{}
$scanName = 'Barcode|Scanner|Honeywell|Symbol|Zebra|Datalogic|Newland|Mindeo|Cipher|POSL'
$skip = 'Enumerator|Adapter|Radio|RFCOMM Protocol|Generic Attribute|Generic Access|Microsoft Bluetooth|Intel Wireless|Realtek|Qualcomm|Bluetooth LE Generic|Service Discovery'
function Add-Row($id, $name, $kind) {
  $id = ([string]$id).Trim()
  $name = ([string]$name).Trim()
  $kind = ([string]$kind).Trim()
  if (-not $id -or -not $name) { return }
  if ($seen.ContainsKey($id)) { return }
  if ($name -match $skip) { return }
  $seen[$id] = $true
  $out.Add([pscustomobject]@{ id = $id; name = $name; kind = $kind }) | Out-Null
}

Get-PnpDevice -PresentOnly | Where-Object {
  $_.Status -eq 'OK' -and $_.FriendlyName -and ($_.FriendlyName -match $scanName)
} | ForEach-Object { Add-Row $_.InstanceId $_.FriendlyName 'usb' }

foreach ($cls in @('Bluetooth','BluetoothLE')) {
  Get-PnpDevice -Class $cls | Where-Object {
    $_.FriendlyName -and $_.FriendlyName -match $scanName
  } | ForEach-Object { Add-Row $_.InstanceId $_.FriendlyName 'bluetooth' }
}

Get-PnpDevice -PresentOnly | Where-Object {
  $_.FriendlyName -and $_.InstanceId -match 'BTHENUM|BTHLEDEVICE|BTHLE\\' -and $_.FriendlyName -match $scanName
} | ForEach-Object { Add-Row $_.InstanceId $_.FriendlyName 'bluetooth' }

$reg = 'HKLM:\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices'
if (Test-Path $reg) {
  Get-ChildItem $reg | ForEach-Object {
    $raw = (Get-ItemProperty $_.PSPath).Name
    if (-not $raw) { return }
    $name = ''
    if ($raw -is [string]) { $name = $raw.Trim() }
    else {
      $name = [System.Text.Encoding]::Unicode.GetString([byte[]]$raw).Trim([char]0).Trim()
      if (-not $name) { $name = [System.Text.Encoding]::UTF8.GetString([byte[]]$raw).Trim([char]0).Trim() }
    }
    if ($name -and $name -match $scanName) { Add-Row ('bth:' + $_.PSChildName) $name 'bluetooth' }
  }
}

Get-CimInstance Win32_SerialPort | ForEach-Object {
  $label = if ($_.Name) { [string]$_.Name } else { [string]$_.DeviceID }
  $blob = "$label $([string]$_.Description) $([string]$_.PNPDeviceID)"
  $kind = if ($blob -match 'Bluetooth|BTHENUM|Standard Serial over Bluetooth') { 'bluetooth' } else { 'com' }
  Add-Row ([string]$_.DeviceID) $label $kind
}

ConvertTo-Json -InputObject @($out.ToArray()) -Compress -Depth 4
"#;
    let text = crate::winps::run_powershell(script)?;
    crate::winps::parse_json_vec::<WinScanner>(&text)
}
