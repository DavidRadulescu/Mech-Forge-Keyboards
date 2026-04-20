const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
const vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"];
vect_foldere.forEach(folder => {
    const pathFolder = path.join(__dirname, folder);
    if (!fs.existsSync(pathFolder)) {
        fs.mkdirSync(pathFolder);
    }
});

let obGlobal = { obErori: null };

function initErori() {
    const fisierErori = path.join(__dirname, 'erori.json');
    if (!fs.existsSync(fisierErori)) {
        console.error("EROARE CRITICĂ: Nu există fișierul erori.json. Aplicația se va închide.");
        process.exit(1); 
    }
    let dateString = fs.readFileSync(fisierErori, 'utf8');
    const blockuri = dateString.match(/\{[^}]+\}/g) || [];
    blockuri.forEach(block => {
        const keys = [...block.matchAll(/"([^"]+)"\s*:/g)].map(m => m[1]);
        const uniqueKeys = new Set(keys);
        if (keys.length !== uniqueKeys.size) {
            console.error("AVERTISMENT: S-a găsit o proprietate duplicată în fișierul JSON!");
        }
    });

    try {
        obGlobal.obErori = JSON.parse(dateString);
    } catch (e) {
        console.error("EROARE: Fișierul erori.json nu este un JSON valid.");
        process.exit(1);
    }

    const errObj = obGlobal.obErori;

    if (!errObj.info_erori || !errObj.cale_baza || !errObj.eroare_default) {
        console.error("EROARE: Lipsesc proprietățile principale (info_erori, cale_baza sau eroare_default).");
    } else {
        if (!errObj.eroare_default.titlu || !errObj.eroare_default.text || !errObj.eroare_default.imagine) {
            console.error("EROARE: Lipsesc proprietăți (titlu/text/imagine) în eroare_default.");
        }
        const dirPath = path.join(__dirname, errObj.cale_baza);
        if (!fs.existsSync(dirPath)) {
            console.error(`EROARE: Folderul imaginilor (${errObj.cale_baza}) nu există pe disc!`);
        } else {
            const imgDefault = path.join(dirPath, errObj.eroare_default.imagine);
            if (!fs.existsSync(imgDefault)) {
                console.error(`EROARE: Imaginea default nu a fost găsită: ${errObj.eroare_default.imagine}`);
            }
            errObj.info_erori.forEach(eroare => {
                const imgPath = path.join(dirPath, eroare.imagine);
                if (!fs.existsSync(imgPath)) {
                    console.error(`EROARE: Imaginea lipsă pentru eroarea ${eroare.identificator}: ${eroare.imagine}`);
                }
            });
        }
        let identificatori = [];
        errObj.info_erori.forEach(eroare => {
            if (identificatori.includes(eroare.identificator)) {
                console.error(`EROARE: Identificatorul ${eroare.identificator} apare de mai multe ori! Detalii: Titlu="${eroare.titlu}", Text="${eroare.text}"`);
            }
            identificatori.push(eroare.identificator);
        });

        errObj.eroare_default.imagine = errObj.cale_baza + errObj.eroare_default.imagine;
        errObj.info_erori.forEach(eroare => {
            eroare.imagine = errObj.cale_baza + eroare.imagine;
        });
    }
}
initErori();

function afisareEroare(res, identificator, titlu, text, imagine) {
    let eroareDefault = obGlobal.obErori.eroare_default;
    let eroareCautata = obGlobal.obErori.info_erori.find(err => err.identificator == identificator);
    if (!eroareCautata) eroareCautata = eroareDefault;
    let titluAfisat = titlu || eroareCautata.titlu;
    let textAfisat = text || eroareCautata.text;
    let imagineAfisata = imagine || eroareCautata.imagine;
    if (eroareCautata.status && identificator) {
        res.status(identificator);
    }

    res.render('pagini/eroare', {
        titlu: titluAfisat,
        text: textAfisat,
        imagine: imagineAfisata,
        ip: res.req.ip || res.req.connection.remoteAddress
    });
}

app.use('/resurse', (req, res, next) => {
    if (req.url.endsWith('/')) {
        afisareEroare(res, 403);
    } else {
        next();
    }
});

app.use('/resurse', express.static(path.join(__dirname, 'resurse')));

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'resurse', 'imagini', 'Favicon', 'favicon.ico'));
});

app.get(new RegExp('\\.ejs$'), (req, res) => {
    afisareEroare(res, 400);
});

app.get(['/', '/index', '/home'], (req, res) => {
    const ipUser = req.ip || req.connection.remoteAddress;
    res.render('pagini/index', { ip: ipUser });
});

app.get(/^\/(.*)/, (req, res) => {
    const ipUser = req.ip || req.connection.remoteAddress;
    const numePagina = req.params[0]; 

    res.render('pagini/' + numePagina, { ip: ipUser }, function(err, htmlRenderizat) {
        if (err) {
            if (err.message.includes('Failed to lookup view')) {
                afisareEroare(res, 404);
            } else {
                afisareEroare(res, null, "Eroare de Server", "Ceva s-a stricat la procesarea paginii.");
            }
        } else {
            res.send(htmlRenderizat);
        }
    });
});

app.listen(8080, () => {
    console.log('Serverul express a pornit pe portul 8080!');
});