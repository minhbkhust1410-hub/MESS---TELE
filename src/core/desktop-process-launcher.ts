import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Khởi chạy tiến trình GUI trên Desktop thực tế của người dùng (WinSta0\\Default)
 * Thoát khỏi giới hạn sandbox/job-object của agent và hiển thị trực tiếp cửa sổ trước mắt người dùng
 */
export function launchGuiOnDefaultDesktop(exePath: string, args: string[]): { success: boolean; pid?: number; error?: string } {
  try {
    const rawArgs = args.map(a => `"${a}"`).join(' ');
    
    // Script C# gọi trực tiếp Win32 CreateProcess với lpDesktop = @"WinSta0\Default"
    const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WinDesktopLauncher {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO {
        public Int32 cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public Int32 dwX;
        public Int32 dwY;
        public Int32 dwXSize;
        public Int32 dwYSize;
        public Int32 dwXCountChars;
        public Int32 dwYCountChars;
        public Int32 dwFillAttribute;
        public Int32 dwFlags;
        public Int16 wShowWindow;
        public Int16 cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public Int32 dwProcessId;
        public Int32 dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcess(
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation
    );

    public static int SpawnGui(string appPath, string args) {
        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(si);
        si.lpDesktop = @"WinSta0\\Default";
        si.dwFlags = 1; // STARTF_USESHOWWINDOW
        si.wShowWindow = 3; // SW_SHOWMAXIMIZED

        PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
        string fullCmd = "\\"" + appPath + "\\" " + args;
        // 0x01000210 = CREATE_BREAKAWAY_FROM_JOB (0x01000000) | CREATE_NEW_PROCESS_GROUP (0x200) | CREATE_NEW_CONSOLE (0x10)
        bool ok = CreateProcess(null, fullCmd, IntPtr.Zero, IntPtr.Zero, false, 0x01000210, IntPtr.Zero, null, ref si, out pi);
        if (!ok) {
            ok = CreateProcess(null, fullCmd, IntPtr.Zero, IntPtr.Zero, false, 0x00000210, IntPtr.Zero, null, ref si, out pi);
        }
        if (!ok) {
            return -Marshal.GetLastWin32Error();
        }
        return pi.dwProcessId;
    }
}
"@

$appPath = @'
${exePath}
'@

$argsStr = @'
${rawArgs}
'@

$pidOut = [WinDesktopLauncher]::SpawnGui($appPath, $argsStr)
Write-Output "PID:$pidOut"
`.trim();

    const scriptPath = path.resolve('./.tmp_launcher.ps1');
    fs.writeFileSync(scriptPath, psScript, 'utf8');

    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      timeout: 10000,
      encoding: 'utf8',
    }).trim();

    try { fs.unlinkSync(scriptPath); } catch {}

    const match = out.match(/PID:(-?\d+)/);
    if (match) {
      const pidVal = parseInt(match[1], 10);
      if (pidVal > 0) {
        return { success: true, pid: pidVal };
      } else {
        return { success: false, error: `CreateProcess Win32 Error: ${Math.abs(pidVal)}` };
      }
    }

    return { success: false, error: out || 'Không nhận diện được PID từ launcher' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
