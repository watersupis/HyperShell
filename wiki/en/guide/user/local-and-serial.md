# Local Terminal and Serial

Local Terminal and Serial are optional built-in plugins. Enable them under **Settings > Plugins** and restart when prompted. Once connected, their terminal tabs are managed by the same workspace layout as SSH sessions.

## Local terminal

After enabling Local Terminal, the sidebar lists available shell profiles. Windows can detect Windows PowerShell, PowerShell, Command Prompt, Git Bash, and WSL distributions. Other platforms try to detect the system's default shell. Double-click a profile to open a session. Rescan from the sidebar after installing a WSL distribution or shell.

When adding or editing a profile, configure its display name, executable, arguments, starting directory, icon/color, and environment variables. Custom environment variables are passed to the shell launched by that profile; take care when changing variables such as `PATH`, `HOME`, and `USERPROFILE`. User edits to detected profiles are preserved when rescanning. Hidden detected entries can be restored from the sidebar's hidden-items view. If an executable is unavailable, fix its path or install the corresponding shell.

## Serial terminal

After enabling Serial, add a serial profile from the sidebar. Select the device port and set the baud rate, data bits, stop bits, parity, and flow control according to the device documentation. Both ends must use matching parameters or output may be garbled and communication may fail. Refresh the port list when needed. Enable local echo only when the device requires it to avoid duplicate characters. DTR/RTS are for devices that require those control lines; if unsure, keep the device's expected defaults.

Save the profile and open its session from the sidebar. If the port is missing, confirm that the device is connected, the operating-system driver is working, and no other program has claimed the port. For USB-to-serial adapters, verify that the selected port belongs to the intended device.
