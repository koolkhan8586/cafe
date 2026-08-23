/**
 * Fail early and clearly on an unsupported Node version.
 *
 * Prisma 7 (@prisma/streams-local) and better-sqlite3 both require Node 22+.
 * npm only *warns* about an engine mismatch, so without this check an install
 * on Node 20 appears to succeed and then fails much later with an opaque
 * native-module error.
 */
const REQUIRED_MAJOR = 22;
const major = Number(process.versions.node.split(".")[0]);

if (major < REQUIRED_MAJOR) {
  console.error(`
┌───────────────────────────────────────────────────────────────────┐
│  Cafe LSAF needs Node ${REQUIRED_MAJOR} or newer.                                 │
└───────────────────────────────────────────────────────────────────┘

  You are running Node ${process.versions.node}.

  Both Prisma 7 and better-sqlite3 require Node ${REQUIRED_MAJOR}+. npm only prints a
  warning for this, so the install looks fine and then breaks later.

  On Debian or Ubuntu:

    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs

  Or with nvm:

    nvm install 22 && nvm use 22

  Then reinstall so the native modules are rebuilt for the new version:

    rm -rf node_modules package-lock.json
    npm install
`);
  process.exit(1);
}
