const fs = require('fs');
const path = require('path');

const fontPath = path.join(__dirname, 'NotoSansJP-Regular.ttf');
const outputPath = path.join(__dirname, 'NotoSansJP.js');

try {
    const stats = fs.statSync(fontPath);
    console.log(`Font file size: ${stats.size} bytes`);

    // Check if file is html (small size check)
    if (stats.size < 10000) {
        throw new Error("File seems too small to be a font. Likely an HTML error page.");
    }

    const fontBuffer = fs.readFileSync(fontPath);
    const base64Font = fontBuffer.toString('base64');
    const fileContent = `const font = "data:font/ttf;base64,${base64Font}";\nexport default font;`;

    fs.writeFileSync(outputPath, fileContent);
    console.log('Successfully generated NotoSansJP.js');
} catch (err) {
    console.error('Error generating font JS:', err);
    process.exit(1);
}
