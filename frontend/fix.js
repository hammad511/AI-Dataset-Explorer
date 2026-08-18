const fs = require('fs');

let c = fs.readFileSync('src/app/explore/page.tsx', 'utf8');

// Feasibility fixes
c = c.replace(/feasibility\?.overall \?\? 'N\/A'/g, "feasibility?.overallScore ?? 'N/A'");
c = c.replace(/feasibility\?.note/g, 'feasibility?.level');

// Hardware fixes
c = c.replace(/hardware\?.gpu \|\| 'Estimated'/g, "hardware?.gpu?.recommendedClass || 'Estimated'");
c = c.replace(/hardware\?.ram \|\| 'Estimated'/g, "hardware?.ram?.recommended || 'Estimated'");

c = c.replace(/<div><span className="text-slate-400">Storage:<\/span>.*?<\/div>/, '<div><span className="text-slate-400">Storage:</span> <span className="text-white">{hardware?.storage?.dataset || \'Estimated\'} (Work: {hardware?.storage?.workingSpace})</span></div>');

c = c.replace(/<div><span className="text-slate-400">Cloud Alternative:<\/span>.*?<\/div>/, '<div><span className="text-slate-400">Cloud Alternative:</span> <span className="text-white">{hardware?.cloudAlternative || \'Estimated\'}</span></div>');

// Dataset fix
c = c.replace(/bestDataset\.relevanceScore/g, 'bestDataset.matchScore');

fs.writeFileSync('src/app/explore/page.tsx', c);
