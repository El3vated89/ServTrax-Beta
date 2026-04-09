const NO_LOCAL_FALLBACK_SUFFIX =
  'No device-only copy was kept. This change must reach the shared database to appear across devices.';

const toEntityLabel = (entityName: string) => entityName.trim() || 'Record';

export const cloudTruthService = {
  buildCreateError: (entityName: string) =>
    new Error(`${toEntityLabel(entityName)} could not be saved to the shared database. ${NO_LOCAL_FALLBACK_SUFFIX}`),

  buildUpdateError: (entityName: string) =>
    new Error(`${toEntityLabel(entityName)} could not be updated in the shared database. ${NO_LOCAL_FALLBACK_SUFFIX}`),

  buildDeleteError: (entityName: string) =>
    new Error(`${toEntityLabel(entityName)} could not be deleted from the shared database.`),

  buildUnsyncedRecordError: (entityName: string) =>
    new Error(`This ${toEntityLabel(entityName).toLowerCase()} only exists in an older device recovery snapshot and is not in the shared database yet.`),
};
