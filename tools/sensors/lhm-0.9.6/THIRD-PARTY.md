# Hardware temperature component

LibreHardwareMonitor 0.9.6 binaries are unmodified, from the upstream official release:
https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6

Source (including copyright notices and source of the MPL-covered assembly):
https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/tree/v0.9.6

LibreHardwareMonitor is licensed under Mozilla Public License 2.0 (included as LICENSE).
Bundled dependency DLLs originate from the same upstream distribution. Upstream dependencies and licenses:
https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/blob/v0.9.6/LibreHardwareMonitorLib/LibreHardwareMonitorLib.csproj

PawnIO is NOT bundled or automatically installed. Official driver source/releases:
https://github.com/namazso/PawnIO.Setup/releases

SynapseX only enables the CPU hardware group and reads sensors; it does not expose fan, voltage, overclocking or other hardware writes through this component.
