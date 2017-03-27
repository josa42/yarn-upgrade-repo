#!/usr/bin/env node

(async () => {

  const fs = require('fs')
  const path = require('path')
  const { exec } = require('child_process');

  const trim = (str) => str.replace(/(^\s+|\s+$)/g, '')

  const sh = (cm, explode = true) => new Promise((resolve, reject) =>
    exec(cm, (error, stdout, stderr) => error && explode ? reject(error) : resolve(stdout || ''))
  )

  const readJSON = (path) => new Promise((resolve, reject) =>
    fs.readFile(path, 'utf8', (error, content) => error ? reject(error) : resolve(JSON.parse(content)))
  )

  const writeJSON = (path, content) => new Promise((resolve, reject) =>
    fs.writeFile(path, `${JSON.stringify(content, null, '  ')}\n`, (error) => error ? reject(error) : resolve())
  )

  const cd = (p) => process.chdir(p)

  const pkgPath = path.join(process.cwd(), 'package.json')
  const tmpPath = `/tmp/yarn-upgrade-internal-tmp-${new Date().getTime()}`

  const defaultFlags = {
    head: false,
    branch: 'master',
  }

  try {
    const [dependency] = process.argv.slice(2).filter((arg) => !/^--/.test(arg));
    const flags = process.argv.slice(2).filter((arg) => /^--/.test(arg)).reduce((flags, flag) => {
      const [, key,, value = true] = flag.match(/--([^=]+)(=(.*))?$/)
      flags[key] = value;
      return flags
    }, defaultFlags);

    if (!dependency) {
      throw new Error('Invalid args');
    }

    if (!fs.existsSync(pkgPath)) {
      throw new Error('package.json is missing');
    }

    const pkg = await readJSON(pkgPath)

    const type = ['dependencies', 'devDependencies'].find((type) => pkg[type] && pkg[type][dependency])
    const value = pkg[type][dependency]
    const [url, hash] = value.split('#')

    await sh(`rm -rf ${tmpPath}`)
    await sh(`mkdir -p ${tmpPath}`)

    cd(tmpPath)

    await sh(`git clone ${url} ${dependency}`)

    cd(`${tmpPath}/${dependency}`)

    await sh(`git checkout ${flags.branch}`)

    let newHash = ''

    if (!flags.head) {
      newHash = trim(await sh('git describe --abbrev=0 --tags --exact-match', false))
      newHash = newHash || trim(await sh('git describe --abbrev=0 --tags'))
    }

    if (!newHash) {
      newHash = trim(await sh('git rev-parse HEAD')).substring(0, 7)
    }

    console.log(`=> ${newHash}`)

    pkg[type][dependency] = `${url}#${newHash}`

    await writeJSON(pkgPath, pkg)

    await sh(`rm -rf ${tmpPath}`)

  } catch(error) {
    console.error(error.message);
  }
})()
