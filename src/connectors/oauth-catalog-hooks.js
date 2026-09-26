function text(value) {
  return String(value ?? '').trim();
}

function notInstalled(error) {
  return /CONNECTOR_CATALOG_NOT_INSTALLED/.test(String(error?.code || error?.message || error));
}

/**
 * Safe bridge between OAuth success/revocation and the durable ConnectorCatalog.
 * It persists only connector version + granted scopes + disabled state.
 * Raw OAuth token material never crosses this boundary.
 */
export function createConnectorCatalogOAuthHooks({
  catalog,
  checkHealthAfterAuthorization = false,
  enableAfterHealthy = false,
} = {}) {
  if (!catalog
    || typeof catalog.install !== 'function'
    || typeof catalog.disable !== 'function') {
    throw new Error('OAUTH_CONNECTOR_CATALOG_REQUIRED');
  }
  if (checkHealthAfterAuthorization && typeof catalog.checkHealth !== 'function') {
    throw new Error('OAUTH_CONNECTOR_HEALTH_REQUIRED');
  }
  if (enableAfterHealthy && typeof catalog.enable !== 'function') {
    throw new Error('OAUTH_CONNECTOR_ENABLE_REQUIRED');
  }

  return Object.freeze({
    async onAuthorized(input = {}) {
      const connectorId = text(input.connector_id);
      const version = text(input.connector_version);
      if (!connectorId || !version) throw new Error('OAUTH_CONNECTOR_IDENTITY_REQUIRED');
      const scopes = Array.isArray(input.granted_scopes)
        ? [...new Set(input.granted_scopes.map(text).filter(Boolean))].sort()
        : [];

      const installation = await catalog.install({
        id: connectorId,
        version,
        grantedScopes: scopes,
      });

      let health = null;
      let enabled = null;
      if (checkHealthAfterAuthorization) {
        health = await catalog.checkHealth(connectorId);
        if (enableAfterHealthy && health?.status === 'healthy') {
          enabled = await catalog.enable(connectorId);
        }
      }

      return Object.freeze({
        connector_id: connectorId,
        version,
        granted_scopes: scopes,
        installation_state: installation.state,
        health: health?.status || null,
        enabled: enabled?.state === 'enabled',
      });
    },

    async onRevoked(input = {}) {
      const connectorId = text(input.connector_id);
      if (!connectorId) throw new Error('OAUTH_CONNECTOR_ID_REQUIRED');
      try {
        const record = await catalog.disable(connectorId);
        return Object.freeze({
          connector_id: connectorId,
          disabled: record?.state === 'disabled',
          already_absent: false,
        });
      } catch (error) {
        if (!notInstalled(error)) throw error;
        return Object.freeze({
          connector_id: connectorId,
          disabled: true,
          already_absent: true,
        });
      }
    },
  });
}
