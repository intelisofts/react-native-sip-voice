import fs from 'fs';
const UA={"User-Agent":"react-native-sip-voice-landmarks/0.1"};
const data=JSON.parse(fs.readFileSync('landmarks.json'));
const files={"Kuwait_Towers":"Kuwait_Towers_RB.jpg","Sultan_Qaboos_Grand_Mosque":"Sultan_Qaboos_Grand_Mosque_RB.jpg","Hassan_II_Mosque":"Hassan_II_mosque,_Casablanca_2.jpg","Bahrain_World_Trade_Center":"Bahrain_WTC.JPG","Museum_of_Islamic_Art,_Doha":"Museum_of_Islamic_Art_in_Doha,_Qatar_(32673171432).jpg","Flame_Towers":"Flame_towers_baku.jpg","Palace_of_the_Parliament":"Bucharest_-_Palace_of_the_Parliament_(2024)_(2).jpg","Bayterek_Tower":"Central_Downtown_Astana_2.jpg"};
const byLandmark={"Kuwait Towers":"Kuwait_Towers","Sultan Qaboos Grand Mosque":"Sultan_Qaboos_Grand_Mosque","Hassan II Mosque":"Hassan_II_Mosque","Bahrain World Trade Center":"Bahrain_World_Trade_Center","Museum of Islamic Art":"Museum_of_Islamic_Art,_Doha","Flame Towers":"Flame_Towers","Palace of the Parliament":"Palace_of_the_Parliament","Bayterek Tower":"Bayterek_Tower"};
const titles=Object.values(files).map(f=>"File:"+f).join("|");
const strip=s=>(s||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
const j=await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1080&titles=${encodeURIComponent(titles)}`,{headers:UA})).json();
const info={};
for(const p of j.query.pages){const ii=p.imageinfo?.[0]; if(!ii) {console.error("miss",p.title); continue;} const md=ii.extmetadata||{}; info[p.title.replace(/^File:/,"").replace(/ /g,"_")]={imageUrl:ii.thumburl||ii.url,sourcePage:ii.descriptionurl,author:strip(md.Artist?.value).slice(0,80),license:strip(md.LicenseShortName?.value)};}
let n=0;
for(const d of data){ if(d.imageUrl) continue; const t=byLandmark[d.landmark]; const f=t&&files[t]; const i=f&&info[f.replace(/ /g,"_")]; if(i && /^(CC|Public domain|PD)/i.test(i.license)){Object.assign(d,i);n++;} else if(i) console.error("non-free?",d.landmark,i.license); }
fs.writeFileSync('landmarks.json',JSON.stringify(data,null,1));
console.log("filled",n,"total with images",data.filter(d=>d.imageUrl).length,"/",data.length);
console.log([...new Set(data.map(d=>d.license))]);
