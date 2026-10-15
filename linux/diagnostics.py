import asyncio
import os
import shutil

def issue(error):
    text=str(error).lower()
    if isinstance(error,PermissionError) or any(x in text for x in ['accessdenied','notauthorized','permission','not permitted']):
        return dict(code='permission',title='Accès Bluetooth refusé',message='Vérifiez votre appartenance au groupe bluetooth et les autorisations de votre session.',retryable=False)
    if isinstance(error,FileNotFoundError) or any(x in text for x in ['org.freedesktop.dbus.error.serviceunknown','dbus daemon','connection refused']):
        return dict(code='service',title='Service Bluetooth indisponible',message='Vérifiez que BlueZ et le service bluetooth sont installés et démarrés.',retryable=False)
    if any(x in text for x in ['notready','powered off','no powered','no default controller','adapter not found']):
        return dict(code='radio',title='Bluetooth désactivé ou absent',message='Activez la radio Bluetooth, puis relancez la connexion.',retryable=False)
    if 'fff0' in text or 'fff3' in text:
        return dict(code='unsupported',title='Contrôleur non compatible',message='Ce périphérique n’expose pas les commandes Magic Lantern attendues.',retryable=False)
    return dict(code='unreachable',title='LED injoignables',message='Rapprochez le contrôleur, vérifiez son alimentation et fermez les autres apps ou ponts Bluetooth. Une autre connexion est possible, sans pouvoir la confirmer.',retryable=True)

async def diagnose(adapter=None):
    if not shutil.which('bluetoothctl'):return [dict(label='BlueZ',ok=False,message='Installez le paquet bluez de votre distribution.')]
    try:
        process=await asyncio.create_subprocess_exec('bluetoothctl','show',*([adapter] if adapter else []),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,env=dict(os.environ,LC_ALL='C'))
        try:
            async with asyncio.timeout(6):out,err=await process.communicate()
        except TimeoutError:
            process.kill();await process.communicate();raise
        text=(out+err).decode(errors='replace')
        present='Controller ' in text and process.returncode==0
        powered=present and 'Powered: yes' in text
        return [dict(label='Adaptateur Bluetooth',ok=present,message='Adaptateur détecté.' if present else 'Aucun adaptateur disponible. Vérifiez le service bluetooth et votre radio.'),
                dict(label='Radio Bluetooth',ok=powered,message='Radio allumée.' if powered else 'Activez la radio ; vérifiez aussi rfkill.'),
                dict(label='Connexion des LED',ok=None,message='Une connexion depuis un autre appareil ne peut pas être détectée avec certitude. Fermez les autres apps pour libérer les LED.')]
    except Exception:return [dict(label='Service Bluetooth',ok=False,message='Le service ne répond pas. Vérifiez systemctl status bluetooth et vos autorisations.')]
