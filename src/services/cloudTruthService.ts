const LOCAL_BACKUP_SUFFIX =
  'A backup was kept on this device only and is not visible on other devices until it syncs.';

const toEntityLabel = (entityName: string) => entityName.trim() || 'Record';

export const cloudTruthService = {
  buildCreateError: (entityName: string) =>
    new Error(`${toEntityLabel(entityName)} could not be saved to the shared database. ${LOCAL_BACKUP_SUFFIX}`),

  buildUpdateError: (entityName: string) =>
    new Error(`${toEntityLabel(entityName)} could not be updated in the shared database. ${LOCAL_BACKUP_SUFFIX}`),

  buildDeleteError: (entityName: string) =>
    new Error(`${toEntityLabel(entityName)} could not be deleted from the shared database. The latest change only exists on this device.`),

  buildUnsyncedRecordError: (entityName: string) =>
    new Error(`This ${toEntityLabel(entityName).toLowerCase()} exists only as a device backup and has not synced to the shared database yet.`),
};
