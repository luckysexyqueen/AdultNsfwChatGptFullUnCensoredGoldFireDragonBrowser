// piajs is a storage helper, not a VPN tunnel or a credential vault.
try {
  const mod = await import('piajs');
  if (!mod) throw Error('empty module');
  console.log('piajs available for browser VPN preference storage');
} catch (error) {
  console.error('piajs not installed:', error.message);
  process.exitCode=1;
}
