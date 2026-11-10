// Optional adapter: no database or relay is created without explicit initialization.
export const EVOLU_SOURCE = 'https://github.com/PumaBrowser/evolu.git';
export async function createEvoluPlugin({ schema, appName, appOwner, transports = [] }) {
  if (!schema || !appName || !appOwner) throw Error('schema, appName and appOwner are required');
  const [{ createEvolu, AppName }, { createRun }, { createEvoluDeps }] = await Promise.all([
    import('@evolu/common'), import('@evolu/web'), import('@evolu/react-web')
  ]);
  const run = createRun(createEvoluDeps());
  const instance = await run.ok(createEvolu(schema, {
    appName: AppName.orThrow(appName), appOwner, transports
  }));
  return Object.freeze({ instance, offlineOnly: transports.length === 0 });
}
