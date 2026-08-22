mod printer;
mod scanners;
#[cfg(target_os = "windows")]
mod winps;

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize)]
struct BtPrinter {
    id: String,
    name: String,
}

#[tauri::command]
fn list_bluetooth_printers() -> Result<Vec<BtPrinter>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_bt_printers()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[cfg(target_os = "windows")]
fn windows_bt_printers() -> Result<Vec<BtPrinter>, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out = New-Object System.Collections.Generic.List[object]
$seen = @{}
$btCom = @{}
function Add-Dev($id, $name) {
  $id = ([string]$id).Trim()
  $name = ([string]$name).Trim()
  if (-not $id -or -not $name) { return }
  if ($seen.ContainsKey($id) -or $seen.ContainsKey($name.ToLower())) { return }
  $skip = 'Enumerator|Adapter|Radio|RFCOMM Protocol|Generic Attribute|Generic Access|Microsoft Bluetooth|Intel Wireless|Realtek|Qualcomm|Bluetooth LE Generic|Service Discovery|Headphone|Headset|AirPods|Speaker|Hands-Free|AVRCP'
  if ($name -match $skip) { return }
  $seen[$id] = $true
  $seen[$name.ToLower()] = $true
  $out.Add([pscustomobject]@{ id = $id; name = $name }) | Out-Null
}

Get-CimInstance Win32_SerialPort | ForEach-Object {
  $label = if ($_.Name) { [string]$_.Name } else { [string]$_.DeviceID }
  $blob = "$label $([string]$_.Description) $([string]$_.PNPDeviceID)"
  if ($blob -match 'Bluetooth|BTHENUM|Standard Serial over Bluetooth') {
    Add-Dev ([string]$_.DeviceID) $label
    $btCom[([string]$_.DeviceID)] = $true
    $btCom[([string]$_.DeviceID + ':')] = $true
  }
}

Get-CimInstance Win32_Printer | ForEach-Object {
  $port = [string]$_.PortName
  $driver = [string]$_.DriverName
  $name = [string]$_.Name
  if ($port -match 'BTH' -or $driver -match 'Bluetooth' -or $name -match 'Bluetooth' -or $btCom.ContainsKey($port)) {
    Add-Dev ('prn:' + $name) $name
  }
}

foreach ($cls in @('Bluetooth','BluetoothLE')) {
  Get-PnpDevice -Class $cls -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName } | ForEach-Object {
    Add-Dev $_.InstanceId $_.FriendlyName
  }
}

Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
  $_.FriendlyName -and $_.InstanceId -match 'BTHENUM|BTHLEDEVICE|BTHLE\\'
} | ForEach-Object { Add-Dev $_.InstanceId $_.FriendlyName }

$reg = 'HKLM:\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices'
if (Test-Path $reg) {
  Get-ChildItem $reg -ErrorAction SilentlyContinue | ForEach-Object {
    $raw = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).Name
    if (-not $raw) { return }
    $name = ''
    if ($raw -is [string]) { $name = $raw.Trim() }
    else {
      $name = [System.Text.Encoding]::Unicode.GetString([byte[]]$raw).Trim([char]0).Trim()
      if (-not $name) { $name = [System.Text.Encoding]::UTF8.GetString([byte[]]$raw).Trim([char]0).Trim() }
    }
    if ($name) { Add-Dev ('bth:' + $_.PSChildName) $name }
  }
}

ConvertTo-Json -InputObject @($out.ToArray()) -Compress -Depth 4
"#;
    let text = crate::winps::run_powershell(script)?;
    crate::winps::parse_json_vec::<BtPrinter>(&text)
}

fn sqlite_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("kasir.sqlite"))
}

#[tauri::command]
fn load_sqlite(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = sqlite_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(Some(data_encoding_base64(&bytes)))
}

#[tauri::command]
fn save_sqlite(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = sqlite_path(&app)?;
    let bytes = data_decoding_base64(&data)?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

fn data_encoding_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let c = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (a << 16) | (b << 8) | c;
        out.push(TABLE[((triple >> 18) & 63) as usize] as char);
        out.push(TABLE[((triple >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn data_decoding_base64(raw: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Result<u8, String> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err("Backup tidak valid".into()),
        }
    }
    let cleaned: Vec<u8> = raw.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if cleaned.len() % 4 != 0 {
        return Err("Backup tidak valid".into());
    }
    let mut out = Vec::new();
    for chunk in cleaned.chunks(4) {
        let pad = chunk.iter().filter(|&&c| c == b'=').count();
        let a = val(chunk[0])? as u32;
        let b = val(chunk[1])? as u32;
        let c = if chunk[2] == b'=' { 0 } else { val(chunk[2])? as u32 };
        let d = if chunk[3] == b'=' { 0 } else { val(chunk[3])? as u32 };
        let triple = (a << 18) | (b << 12) | (c << 6) | d;
        out.push(((triple >> 16) & 255) as u8);
        if pad < 2 {
            out.push(((triple >> 8) & 255) as u8);
        }
        if pad < 1 {
            out.push((triple & 255) as u8);
        }
    }
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_bluetooth_printers,
            printer::list_windows_printers,
            printer::open_cash_drawer,
            printer::print_raw,
            scanners::list_scanners,
            load_sqlite,
            save_sqlite
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
