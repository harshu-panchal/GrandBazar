const fs = require('fs');
const path = require('path');
const pkgPath = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

['dependencies', 'devDependencies'].forEach(type => {
  if (pkg[type]) {
    for (const dep in pkg[type]) {
      pkg[type][dep] = 'latest';
    }
  }
});
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
