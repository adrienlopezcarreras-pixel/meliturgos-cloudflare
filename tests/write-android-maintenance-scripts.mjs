import {mkdirSync,writeFileSync} from 'node:fs';
import {androidMaintenancePcCommand} from '../src/devices/android-maintenance-companion.js';
import {androidStagePcCommand} from '../src/devices/android-apk-stage-companion.js';
import {miniFirmwareStageCommand} from '../src/devices/mini-firmware-stage-companion.js';
const out='.ci-android-maintenance';
mkdirSync(out,{recursive:true});
const samples=[
 ['assess',androidMaintenancePcCommand('android.maintenance.assess').command],
 ['mini-stage',miniFirmwareStageCommand({filename:'mel-mini-0.6.14.bin',sha256:'f'.repeat(64)}).command],
 ['stage',androidStagePcCommand({filename:'MEL-Android-0.7.10.apk',sha256:'a'.repeat(64)}).command],
 ['install',androidMaintenancePcCommand('android.maintenance.install',{serial:'192.168.1.55:39547',sha256:'a'.repeat(64)}).command],
];
for(const [action,code] of samples)writeFileSync(out+'/'+action+'.ps1',code,'utf8');
