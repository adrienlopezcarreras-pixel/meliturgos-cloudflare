import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Windows Companion keeps owner PC/compute permissions visible and refreshes them immediately', async () => {
  const source = await readFile(new URL('../windows-companion/MEL-Companion.cs', import.meta.url), 'utf8');
  const main = source.slice(source.indexOf('class MainForm : Form'), source.indexOf('\nclass Program'));
  assert.ok(main.length > 0, 'MainForm must exist');

  // The connection banner has only the online state: never cram permission
  // labels into its fixed-width 670px label next to the Open MEL button.
  assert.match(main, /connection=LabelAt\(this,"Vérification de la connexion…",28,78,670,30/);
  assert.match(main, /connection\.Text=online\?"Connecté à MEL":"Serveur indisponible — reconnexion automatique";/);
  const connectionRefresh = main.slice(main.indexOf('connection.Text=online?'), main.indexOf('connection.ForeColor=online?'));
  assert.doesNotMatch(connectionRefresh, /connection\.Text[\s\S]*Accès PC/);

  // Show grants below the host name, away from the header buttons, and
  // keep them responsive to the PC card's width.
  assert.match(main, /Label localAccessStatus;/);
  assert.match(main, /localAccessStatus=LabelAt\(pc,"Accès PC : désactivé  \|  Calcul local : désactivé",20,91,pc\.Width-40,22/);
  assert.match(main, /localAccessStatus\.Anchor=AnchorStyles\.Top\|AnchorStyles\.Left\|AnchorStyles\.Right/);
  assert.match(main, /localAccessStatus\.Text="Accès PC : "\+\(pcAccess\?"autorisé":"désactivé"\)/);
  assert.match(main, /"  \|  Calcul local : "\+\(computeAllowed\?/);
  assert.match(main, /var pcAccess=MelApp\.ConfigBool\("remote_access_enabled"\)/);
  assert.match(main, /var computeAllowed=MelApp\.ConfigBool\("local_compute_enabled"\)/);

  // Closing the local permissions dialog updates the display without
  // waiting for the 30-second polling tick.
  assert.match(main, /delegate\{using\(var dlg=new PermissionsForm\(\)\)dlg\.ShowDialog\(this\);RefreshAll\(\);\}/);
});
