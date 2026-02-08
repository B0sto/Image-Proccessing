const sharp = require('sharp');

const text = 'wm';
const fontSize = 24;
const opacity = 45;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="220">
  <style>
    .w {
      fill: rgba(255, 255, 255, ${opacity / 100});
      font-size: ${fontSize}px;
      font-family: Arial, sans-serif;
      font-weight: 700;
    }
  </style>
  <text x="40" y="140" class="w">${text}</text>
</svg>
`;

sharp({
  create: {
    width: 300,
    height: 200,
    channels: 3,
    background: { r: 120, g: 40, b: 200 },
  },
})
  .png()
  .toBuffer()
  .then((buf) => sharp(buf).composite([{ input: Buffer.from(svg), gravity: 'north' }]).toBuffer())
  .then(() => {
    console.log('OK');
  })
  .catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
  });
