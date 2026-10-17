import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Windows Companion keeps owner PC/compute permissions visible and refreshes them immediately', async () => {
  const source = await readFile(new URL('../windows-companion/MEL-Companion.cs', import.meta.url), 'utf8');
  const main = source.slice(source.indexOf('class MainForm : Form'), source.indexOf('\nclass Program'));
  assert.ok(main.length > 0, 'MainForm must exist');

  // The connection banner has only the online state: never cram permission
  // labels into it.
  assert.match(main, /connection=CellLabel\(brand,"Vérification de la connexion…"/);
  assert.match(main, /connection\.Text=online\?"Connecté à MEL":"Serveur indisponible — reconnexion automatique";/);
  const connectionRefresh = main.slice(main.indexOf('connection.Text=online?'), main.indexOf('connection.ForeColor=online?'));
  assert.doesNotMatch(connectionRefresh.split(';')[0], /Accès PC/);

  // Show grants in their own row of the work-station card (a docked layout
  // cell, so it follows the card's width).
  assert.match(main, /Label localAccessStatus;/);
  assert.match(main, /localAccessStatus=CellLabel\(work,"Accès PC : état en attente"/);
  assert.match(main, /localAccessStatus\.Text="Accès PC : "\+\(pcAccess\?"autorisé":"désactivé"\)/);
  assert.match(main, /"  \|  Calcul local : "\+\(computeAllowed\?/);
  assert.match(main, /var pcAccess=MelApp\.ConfigBool\("remote_access_enabled"\)/);
  assert.match(main, /var computeAllowed=MelApp\.ConfigBool\("local_compute_enabled"\)/);

  // Closing the local permissions dialog updates the display without
  // waiting for the 30-second polling tick.
  assert.match(main, /using\(var dlg=new PermissionsForm\(\)\)dlg\.ShowDialog\(this\);RefreshAll\(\);/);
});
