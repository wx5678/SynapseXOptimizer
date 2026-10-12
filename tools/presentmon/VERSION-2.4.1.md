# PresentMon console 2.4.1 x64

Source: https://github.com/GameTechDev/PresentMon/releases/tag/v2.4.1

Asset: https://github.com/GameTechDev/PresentMon/releases/download/v2.4.1/PresentMon-2.4.1-x64.exe

SHA256: d74183e7ae630f72cd3690be0373ecbfdc6cbb86578148aab8fa2a7166068f34

Downloaded from the official release and verified against its published digest. MIT license in LICENSE.txt. Original 1.10 binary retained for existing read-only checks; desktop live collector uses 2.4.1.

Live mode: --process_id PID --output_stdout --no_console_stats --v1_metrics --no_track_display --no_track_input --no_track_gpu --session_name UUID --terminate_on_proc_exit

Stop: --terminate_existing_session --session_name UUID. Desktop shutdown waits for this cleanup, then terminates any remaining owned child. No driver, injection, system power change or game configuration change.
