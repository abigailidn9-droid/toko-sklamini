use serde::de::DeserializeOwned;

#[cfg(target_os = "windows")]
pub fn run_powershell(script: &str) -> Result<String, String> {
    run_powershell_env(script, &[])
}

#[cfg(target_os = "windows")]
pub fn run_powershell_env(script: &str, env: &[(&str, String)]) -> Result<String, String> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "-",
    ])
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .creation_flags(CREATE_NO_WINDOW);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(script.as_bytes())
            .map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let msg = if stderr.is_empty() { stdout } else { stderr };
        return Err(if msg.is_empty() {
            "Perintah Windows gagal".into()
        } else {
            msg
        });
    }
    Ok(stdout)
}

pub fn parse_json_vec<T: DeserializeOwned>(text: &str) -> Result<Vec<T>, String> {
    let t = extract_json(text);
    if t.is_empty() || t == "null" {
        return Ok(Vec::new());
    }
    if t.starts_with('[') {
        return serde_json::from_str(t).map_err(|e| e.to_string());
    }
    if t.starts_with('{') {
        let one: T = serde_json::from_str(t).map_err(|e| e.to_string())?;
        return Ok(vec![one]);
    }
    Err("Hasil pemindaian tidak valid".into())
}

fn extract_json(text: &str) -> &str {
    let t = text.trim().trim_start_matches('\u{feff}').trim();
    if let Some(i) = t.find('[') {
        return t[i..].trim();
    }
    if let Some(i) = t.find('{') {
        return t[i..].trim();
    }
    t
}
