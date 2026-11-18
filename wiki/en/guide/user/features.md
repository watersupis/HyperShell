# Features and Plugins

HyperShell organizes features as plugins. Availability, entry points, and permissions may change by release; use this page as a guide and check **Settings > Plugins**, the relevant package manifest, and its permission details for the installed release.

| Feature | What it does | Availability |
| --- | --- | --- |
| SSH hosts and terminals | Manage hosts, SSH sessions, tabs, and workspaces | Core feature |
| SFTP | Two-pane file browsing, transfer, sync, bookmarks, and remote editing | Enable under **Settings > Plugins**, then restart |
| Local terminal | Local shells, WSL, and local profiles | Enable the built-in plugin and restart |
| Serial | Serial profiles and terminal connections | Enable the built-in plugin and restart when requested; compatible hardware is required |
| Session recording | Start recording from the terminal toolbar; browse, replay, and manage recordings in the library | Configure automatic recording and output folders in terminal settings; the library is a core built-in feature |
| SSH tunnels | Local, remote, and dynamic port forwarding | Enable the built-in plugin and restart |
| Quick Command Center | Public command library, personal snippets, command suggestions, and terminal input broadcast | Enable the built-in plugin in plugin management and restart when prompted |
| Host Monitor | Monitor multiple connected SSH hosts on its own page; the terminal toolbar opens the current host | Install the external plugin and grant monitoring read permission |
| Remote Process Manager | Inspect processes, ports, and Docker resources for the current SSH host in a workspace tab | Install the external plugin and grant only the required permissions |
| Network Diagnostics | Plugin skeleton only; not a usable diagnostics tool yet | Not implemented |

Quick Command Center ships as a built-in plugin and does not need an external package. Other external plugins request permissions through their manifest. Installation does not prove that every advertised feature is implemented, and granted access is limited to declared capabilities. Review the publisher, package, and permissions before installing.
