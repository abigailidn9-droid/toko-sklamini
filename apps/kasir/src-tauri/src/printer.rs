use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct WinPrinter {
    pub name: String,
    #[serde(rename = "default")]
    pub is_default: bool,
}

#[tauri::command]
pub fn list_windows_printers() -> Result<Vec<WinPrinter>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_list_printers()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn open_cash_drawer(printer_name: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows_open_drawer(printer_name.unwrap_or_default())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = printer_name;
        Err("Laci kasir hanya bisa dibuka di aplikasi Windows".into())
    }
}

#[cfg(target_os = "windows")]
fn windows_list_printers() -> Result<Vec<WinPrinter>, String> {
    let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out = New-Object System.Collections.Generic.List[object]
Get-CimInstance Win32_Printer | ForEach-Object {
  $out.Add([pscustomobject]@{ name = [string]$_.Name; default = [bool]$_.Default }) | Out-Null
}
ConvertTo-Json -InputObject @($out.ToArray()) -Compress
"#;
    let text = crate::winps::run_powershell(script)?;
    crate::winps::parse_json_vec::<WinPrinter>(&text)
}

#[cfg(target_os = "windows")]
fn windows_open_drawer(printer_name: String) -> Result<(), String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$printer = [string]$env:SKLAMINI_PRINTER
if (-not $printer) {
  $printer = [string]((Get-CimInstance Win32_Printer | Where-Object { $_.Default } | Select-Object -First 1).Name)
}
if (-not $printer) { throw 'Printer Windows tidak ditemukan' }

if (-not ('SklaminiSpool' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SklaminiSpool {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOC_INFO_1 {
    public string pDocName;
    public string pOutputFile;
    public string pDatatype;
  }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint StartDocPrinter(IntPtr h, int lvl, ref DOC_INFO_1 d);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
}
"@
}

$bytes = [byte[]](0x1B, 0x40, 0x1B, 0x70, 0x00, 0x19, 0xFA, 0x1B, 0x70, 0x01, 0x19, 0xFA, 0x10, 0x14, 0x01, 0x00, 0x01)
$h = [IntPtr]::Zero
if (-not [SklaminiSpool]::OpenPrinter($printer, [ref]$h, [IntPtr]::Zero)) {
  throw "Tidak bisa membuka printer: $printer"
}
$di = New-Object SklaminiSpool+DOC_INFO_1
$di.pDocName = 'CashDrawer'
$di.pOutputFile = $null
$di.pDatatype = 'RAW'
$ok = $false
try {
  if ([SklaminiSpool]::StartDocPrinter($h, 1, [ref]$di) -eq 0) { throw 'Gagal StartDocPrinter RAW' }
  try {
    if (-not [SklaminiSpool]::StartPagePrinter($h)) { throw 'Gagal StartPagePrinter' }
    $written = 0
    if (-not [SklaminiSpool]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)) { throw 'Gagal kirim perintah laci' }
    $ok = $true
  } finally {
    [SklaminiSpool]::EndPagePrinter($h) | Out-Null
  }
} finally {
  [SklaminiSpool]::EndDocPrinter($h) | Out-Null
  [SklaminiSpool]::ClosePrinter($h) | Out-Null
}
if (-not $ok) { throw 'Gagal membuka laci kasir' }
'ok'
"#;
    let text = crate::winps::run_powershell_env(script, &[("SKLAMINI_PRINTER", printer_name)])?;
    if (!text.contains("ok")) {
        Err(if text.is_empty() {
            "Gagal membuka laci kasir".into()
        } else {
            text
        })
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn print_raw(printer_name: Option<String>, data: String, com_port: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows_print_raw(
            printer_name.unwrap_or_default(),
            data,
            com_port.unwrap_or_default(),
        )
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (printer_name, data, com_port);
        Err("Cetak langsung hanya di aplikasi Windows".into())
    }
}

#[cfg(target_os = "windows")]
fn windows_print_raw(printer_name: String, data_b64: String, com_port: String) -> Result<(), String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$bytes = [Convert]::FromBase64String([string]$env:SKLAMINI_BYTES)
$com = [string]$env:SKLAMINI_COM
if ($com) {
  $port = New-Object System.IO.Ports.SerialPort $com,115200,None,8,one
  $port.WriteTimeout = 4000
  $port.Open()
  try { $port.Write($bytes, 0, $bytes.Length) } finally { $port.Close() }
  'ok'
  return
}
$printer = [string]$env:SKLAMINI_PRINTER
if (-not $printer) {
  $printer = [string]((Get-CimInstance Win32_Printer | Where-Object { $_.Default } | Select-Object -First 1).Name)
}
if (-not $printer) { throw 'Printer Windows tidak ditemukan' }
if (-not ('SklaminiSpool' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SklaminiSpool {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOC_INFO_1 {
    public string pDocName;
    public string pOutputFile;
    public string pDatatype;
  }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint StartDocPrinter(IntPtr h, int lvl, ref DOC_INFO_1 d);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
}
"@
}
function Send-Bytes($name, $payload, $datatype) {
  $h = [IntPtr]::Zero
  if (-not [SklaminiSpool]::OpenPrinter($name, [ref]$h, [IntPtr]::Zero)) { return $false }
  $di = New-Object SklaminiSpool+DOC_INFO_1
  $di.pDocName = 'Struk'
  $di.pOutputFile = $null
  $di.pDatatype = $datatype
  $ok = $false
  try {
    if ([SklaminiSpool]::StartDocPrinter($h, 1, [ref]$di) -eq 0) { return $false }
    try {
      if (-not [SklaminiSpool]::StartPagePrinter($h)) { return $false }
      $written = 0
      if (-not [SklaminiSpool]::WritePrinter($h, $payload, $payload.Length, [ref]$written)) { return $false }
      $ok = $true
    } finally {
      [SklaminiSpool]::EndPagePrinter($h) | Out-Null
      [SklaminiSpool]::EndDocPrinter($h) | Out-Null
    }
  } finally {
    [SklaminiSpool]::ClosePrinter($h) | Out-Null
  }
  return $ok
}
$names = New-Object System.Collections.Generic.List[string]
if ($printer) { $names.Add($printer) | Out-Null }
$def = [string]((Get-CimInstance Win32_Printer | Where-Object { $_.Default } | Select-Object -First 1).Name)
if ($def -and -not $names.Contains($def)) { $names.Add($def) | Out-Null }
$sent = $false
foreach ($n in $names) {
  if (Send-Bytes $n $bytes 'RAW') { $sent = $true; break }
  if (Send-Bytes $n $bytes 'TEXT') { $sent = $true; break }
}
if (-not $sent) { throw 'Gagal mencetak struk. Pilih printer thermal di Pengaturan.' }
'ok'
"#;
    let text = crate::winps::run_powershell_env(
        script,
        &[
            ("SKLAMINI_PRINTER", printer_name),
            ("SKLAMINI_BYTES", data_b64),
            ("SKLAMINI_COM", com_port),
        ],
    )?;
    if text.contains("ok") {
        Ok(())
    } else {
        Err(if text.is_empty() {
            "Gagal mencetak struk".into()
        } else {
            text
        })
    }
}
