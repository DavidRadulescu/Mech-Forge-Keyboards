const express = require('express');
const path = require('path');
const fs = require('fs');
const sass = require('sass');
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"];
vect_foldere.forEach(folder => {
    const pathFolder = path.join(__dirname, folder);
    if (!fs.existsSync(pathFolder)) fs.mkdirSync(pathFolder);
});

let obGlobal = { obErori: null, obGalerie: null };

function initErori() {
    const fisierErori = path.join(__dirname, 'erori.json');
    if (!fs.existsSync(fisierErori)) {
        console.error("EROARE CRITICĂ: Nu există fișierul erori.json.");
        process.exit(1); 
    }
    let dateString = fs.readFileSync(fisierErori, 'utf8');
    obGlobal.obErori = JSON.parse(dateString);
    const errObj = obGlobal.obErori;
    errObj.eroare_default.imagine = errObj.cale_baza + errObj.eroare_default.imagine;
    errObj.info_erori.forEach(eroare => eroare.imagine = errObj.cale_baza + eroare.imagine);
}
initErori();

function afisareEroare(res, identificator, titlu, text, imagine) {
    let errDef = obGlobal.obErori.eroare_default;
    let errCaut = obGlobal.obErori.info_erori.find(e => e.identificator == identificator) || errDef;
    if (errCaut.status && identificator) res.status(identificator);
    res.render('pagini/eroare', {
        titlu: titlu || errCaut.titlu,
        text: text || errCaut.text,
        imagine: imagine || errCaut.imagine,
        ip: res.req.ip || res.req.connection.remoteAddress
    });
}

function initGalerie() {
    const fisierGalerie = path.join(__dirname, 'galerie.json');
    if (fs.existsSync(fisierGalerie)) {
        let date = fs.readFileSync(fisierGalerie, 'utf8');
        obGlobal.obGalerie = JSON.parse(date);
        
        const dirGalerie = path.join(__dirname, obGlobal.obGalerie.cale_galerie);
        if (!fs.existsSync(dirGalerie)) {
            console.error(`EROARE GALERIE: Folderul specificat (${obGlobal.obGalerie.cale_galerie}) nu există!`);
        } else {
            obGlobal.obGalerie.imagini.forEach(img => {
                const imgPathFizic = path.join(dirGalerie, img.cale_relativa);
                if (!fs.existsSync(imgPathFizic)) {
                    console.error(`EROARE GALERIE: Imaginea ${img.cale_relativa} lipsește din folder!`);
                }
                img.cale_absoluta = path.join(obGlobal.obGalerie.cale_galerie, img.cale_relativa);
            });
        }
    }
}
initGalerie();

obGlobal.folderScss = path.join(__dirname, 'resurse', 'scss');
obGlobal.folderCss = path.join(__dirname, 'resurse', 'css');
if (!fs.existsSync(obGlobal.folderScss)) fs.mkdirSync(obGlobal.folderScss, { recursive: true });

function compileazaScss(caleScss, caleCss) {
    if (!caleCss) {
        let numeScss = path.basename(caleScss);
        let numeCss = numeScss.replace(/\.scss$/i, '.css'); 
        caleCss = path.join(obGlobal.folderCss, numeCss);
    }

    if (fs.existsSync(caleCss)) {
        const backupDir = path.join(__dirname, 'backup', 'resurse', 'css');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        
        let numeFisierCss = path.basename(caleCss);
        // Bonus 3: Adaugă timestamp la finalul numelui de backup
        let numeFisierBackup = numeFisierCss.replace(/\.css$/i, '_' + new Date().getTime() + '.css');
        let caleBackup = path.join(backupDir, numeFisierBackup);
        
        try {
            fs.copyFileSync(caleCss, caleBackup);
        } catch (err) {
            console.error("Eroare la crearea backup-ului CSS:", err);
        }
    }
    try {
        let rezultat = sass.compile(caleScss);
        fs.writeFileSync(caleCss, rezultat.css);
    } catch (err) {
        console.error("Eroare compilare SASS:", err.message);
    }
}
fs.readdirSync(obGlobal.folderScss).forEach(file => {
    if (file.endsWith('.scss')) {
        compileazaScss(path.join(obGlobal.folderScss, file));
    }
});
fs.watch(obGlobal.folderScss, (eventType, filename) => {
    if (filename && filename.endsWith('.scss')) {
        console.log(`S-a modificat fișierul ${filename}, recompilăm...`);
        compileazaScss(path.join(obGlobal.folderScss, filename));
    }
});

app.use('/resurse', (req, res, next) => {
    if (req.url.endsWith('/')) afisareEroare(res, 403);
    else next();
});
app.use('/resurse', express.static(path.join(__dirname, 'resurse')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'resurse', 'imagini', 'Favicon', 'favicon.ico')));
app.get(new RegExp('\\.ejs$'), (req, res) => afisareEroare(res, 400));
app.get(['/', '/index', '/home'], (req, res) => {
    const ipUser = req.ip || req.connection.remoteAddress;
    
    let ora = new Date().getHours();
    let timpZilei;
    if (ora >= 5 && ora < 12) timpZilei = "dimineata";
    else if (ora >= 12 && ora < 20) timpZilei = "zi";
    else timpZilei = "noapte";

    let imaginiFiltrate = [];
    if(obGlobal.obGalerie && obGlobal.obGalerie.imagini) {
        imaginiFiltrate = obGlobal.obGalerie.imagini.filter(img => img.timp === timpZilei);
        let nrImagini = Math.floor(imaginiFiltrate.length / 3) * 3;
        imaginiFiltrate = imaginiFiltrate.slice(0, nrImagini);
    }

    res.render('pagini/index', { ip: ipUser, imagini: imaginiFiltrate });
});

app.get(/^\/(.*)/, (req, res) => {
    const ipUser = req.ip || req.connection.remoteAddress;
    const numePagina = req.params[0]; 
    res.render('pagini/' + numePagina, { ip: ipUser }, function(err, htmlRenderizat) {
        if (err) {
            if (err.message.includes('Failed to lookup view')) afisareEroare(res, 404);
            else afisareEroare(res, null, "Eroare de Server", "Ceva s-a stricat la procesarea paginii.");
        } else {
            res.send(htmlRenderizat);
        }
    });
});
app.listen(8080, () => console.log('Serverul express a pornit pe portul 8080!'));