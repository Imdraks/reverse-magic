import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('conversion_preflight', Path(__file__).resolve().parents[2] / 'gateway/conversion-preflight.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class ConversionChecks(unittest.TestCase):
    def test_windows_and_wsl_do_not_attempt_wireless_checks(self):
        for system, release in [('win32', '10'), ('linux', '6.6-microsoft-standard-WSL2')]:
            with patch.object(preflight.sys, 'platform', system), patch.object(preflight.platform, 'release', return_value=release), patch.object(preflight.shutil, 'which', return_value='/tool'), patch.object(preflight, 'command') as command:
                report = preflight.inspect()
                self.assertFalse(report['canFlash'])
                self.assertFalse(report['checks'][0]['ok'])
                command.assert_not_called()

    def test_available_tools_never_certify_a_bulb_or_enable_flashing(self):
        def command(arguments):
            return (True, 'Supported interface modes:\n\t * managed\n\t * AP\n') if arguments[0] == 'iw' else (True, '29.0')
        with patch.object(preflight.sys, 'platform', 'linux'), patch.object(preflight.platform, 'release', return_value='6.8-generic'), patch.object(preflight.shutil, 'which', return_value='/tool'), patch.object(preflight, 'command', side_effect=command) as invoked:
            report = preflight.inspect()
            self.assertTrue(all(row['ok'] for row in report['checks']))
            self.assertFalse(report['canFlash'])
            self.assertEqual([call.args[0] for call in invoked.call_args_list], [['iw', 'list'], ['docker', 'info', '--format', '{{.ServerVersion}}']])


if __name__ == '__main__':
    unittest.main()
