const L = [
["1","US","United States","Statue of Liberty","New York","Statue_of_Liberty"],
["1","CA","Canada","CN Tower","Toronto","CN_Tower"],
["7","RU","Russia","Saint Basil's Cathedral","Moscow","Saint_Basil's_Cathedral"],
["76","KZ","Kazakhstan","Bayterek Tower","Astana","Bayterek_Tower"],
["77","KZ","Kazakhstan","Bayterek Tower","Astana","Bayterek_Tower"],
["20","EG","Egypt","Pyramids of Giza","Giza","Giza_pyramid_complex"],
["27","ZA","South Africa","Table Mountain","Cape Town","Table_Mountain"],
["30","GR","Greece","Parthenon","Athens","Parthenon"],
["31","NL","Netherlands","Amsterdam Canals","Amsterdam","Canals_of_Amsterdam"],
["32","BE","Belgium","Atomium","Brussels","Atomium"],
["33","FR","France","Eiffel Tower","Paris","Eiffel_Tower"],
["34","ES","Spain","Sagrada Família","Barcelona","Sagrada_Família"],
["36","HU","Hungary","Hungarian Parliament","Budapest","Hungarian_Parliament_Building"],
["39","IT","Italy","Colosseum","Rome","Colosseum"],
["40","RO","Romania","Palace of the Parliament","Bucharest","Palace_of_the_Parliament"],
["41","CH","Switzerland","Matterhorn","Zermatt","Matterhorn"],
["43","AT","Austria","Schönbrunn Palace","Vienna","Schönbrunn_Palace"],
["44","GB","United Kingdom","London Eye","London","London_Eye"],
["45","DK","Denmark","Nyhavn","Copenhagen","Nyhavn"],
["46","SE","Sweden","Stockholm City Hall","Stockholm","Stockholm_City_Hall"],
["47","NO","Norway","Geirangerfjord","Geiranger","Geirangerfjord"],
["48","PL","Poland","Wawel Castle","Kraków","Wawel_Castle"],
["49","DE","Germany","Brandenburg Gate","Berlin","Brandenburg_Gate"],
["51","PE","Peru","Machu Picchu","Cusco","Machu_Picchu"],
["52","MX","Mexico","Chichén Itzá","Yucatán","Chichen_Itza"],
["53","CU","Cuba","El Capitolio","Havana","El_Capitolio"],
["54","AR","Argentina","Obelisco","Buenos Aires","Obelisco_de_Buenos_Aires"],
["55","BR","Brazil","Christ the Redeemer","Rio de Janeiro","Christ_the_Redeemer_(statue)"],
["56","CL","Chile","Moai","Easter Island","Moai"],
["57","CO","Colombia","Walled City","Cartagena","Walled_city_of_Cartagena"],
["58","VE","Venezuela","Angel Falls","Canaima","Angel_Falls"],
["60","MY","Malaysia","Petronas Towers","Kuala Lumpur","Petronas_Towers"],
["61","AU","Australia","Sydney Opera House","Sydney","Sydney_Opera_House"],
["62","ID","Indonesia","Borobudur","Central Java","Borobudur"],
["63","PH","Philippines","Chocolate Hills","Bohol","Chocolate_Hills"],
["64","NZ","New Zealand","Sky Tower","Auckland","Sky_Tower_(Auckland)"],
["65","SG","Singapore","Marina Bay Sands","Singapore","Marina_Bay_Sands"],
["66","TH","Thailand","Wat Arun","Bangkok","Wat_Arun"],
["81","JP","Japan","Mount Fuji","Shizuoka","Mount_Fuji"],
["82","KR","South Korea","Gyeongbokgung","Seoul","Gyeongbokgung"],
["84","VN","Vietnam","Hạ Long Bay","Quảng Ninh","Hạ_Long_Bay"],
["86","CN","China","Great Wall","Beijing","Great_Wall_of_China"],
["90","TR","Türkiye","Hagia Sophia","Istanbul","Hagia_Sophia"],
["91","IN","India","Taj Mahal","Agra","Taj_Mahal"],
["92","PK","Pakistan","Badshahi Mosque","Lahore","Badshahi_Mosque"],
["93","AF","Afghanistan","Band-e Amir","Bamyan","Band-e-Amir_National_Park"],
["94","LK","Sri Lanka","Sigiriya","Matale","Sigiriya"],
["95","MM","Myanmar","Shwedagon Pagoda","Yangon","Shwedagon_Pagoda"],
["98","IR","Iran","Azadi Tower","Tehran","Azadi_Tower"],
["212","MA","Morocco","Hassan II Mosque","Casablanca","Hassan_II_Mosque"],
["213","DZ","Algeria","Maqam Echahid","Algiers","Maqam_Echahid"],
["216","TN","Tunisia","Amphitheatre of El Jem","El Jem","Amphitheatre_of_El_Jem"],
["218","LY","Libya","Leptis Magna","Khoms","Leptis_Magna"],
["221","SN","Senegal","African Renaissance Monument","Dakar","African_Renaissance_Monument"],
["233","GH","Ghana","Cape Coast Castle","Cape Coast","Cape_Coast_Castle"],
["234","NG","Nigeria","Zuma Rock","Niger State","Zuma_Rock"],
["249","SD","Sudan","Pyramids of Meroë","Meroë","Meroë"],
["251","ET","Ethiopia","Church of Saint George","Lalibela","Church_of_Saint_George,_Lalibela"],
["291","ER","Eritrea","Fiat Tagliero Building","Asmara","Fiat_Tagliero_Building"],
["254","KE","Kenya","Maasai Mara","Narok","Maasai_Mara"],
["255","TZ","Tanzania","Mount Kilimanjaro","Kilimanjaro","Mount_Kilimanjaro"],
["256","UG","Uganda","Murchison Falls","Nwoya","Murchison_Falls"],
["260","ZM","Zambia","Victoria Falls","Livingstone","Victoria_Falls"],
["263","ZW","Zimbabwe","Victoria Falls","Victoria Falls","Victoria_Falls"],
["351","PT","Portugal","Belém Tower","Lisbon","Belém_Tower"],
["353","IE","Ireland","Cliffs of Moher","County Clare","Cliffs_of_Moher"],
["354","IS","Iceland","Hallgrímskirkja","Reykjavík","Hallgrímskirkja"],
["358","FI","Finland","Helsinki Cathedral","Helsinki","Helsinki_Cathedral"],
["380","UA","Ukraine","Saint Sophia Cathedral","Kyiv","Saint_Sophia_Cathedral,_Kyiv"],
["385","HR","Croatia","Walls of Dubrovnik","Dubrovnik","Walls_of_Dubrovnik"],
["420","CZ","Czechia","Charles Bridge","Prague","Charles_Bridge"],
["852","HK","Hong Kong","Victoria Harbour","Hong Kong","Victoria_Harbour"],
["855","KH","Cambodia","Angkor Wat","Siem Reap","Angkor_Wat"],
["880","BD","Bangladesh","Ahsan Manzil","Dhaka","Ahsan_Manzil"],
["886","TW","Taiwan","Taipei 101","Taipei","Taipei_101"],
["961","LB","Lebanon","Baalbek","Baalbek","Baalbek"],
["962","JO","Jordan","Petra","Ma'an","Petra"],
["964","IQ","Iraq","Ziggurat of Ur","Dhi Qar","Ziggurat_of_Ur"],
["965","KW","Kuwait","Kuwait Towers","Kuwait City","Kuwait_Towers"],
["966","SA","Saudi Arabia","Kingdom Centre","Riyadh","Kingdom_Centre"],
["967","YE","Yemen","Shibam","Hadhramaut","Shibam"],
["968","OM","Oman","Sultan Qaboos Grand Mosque","Muscat","Sultan_Qaboos_Grand_Mosque"],
["970","PS","Palestine","Church of the Nativity","Bethlehem","Church_of_the_Nativity"],
["971","AE","United Arab Emirates","Burj Khalifa","Dubai","Burj_Khalifa"],
["972","IL","Israel","Masada","Southern District","Masada"],
["973","BH","Bahrain","Bahrain World Trade Center","Manama","Bahrain_World_Trade_Center"],
["974","QA","Qatar","Museum of Islamic Art","Doha","Museum_of_Islamic_Art,_Doha"],
["977","NP","Nepal","Mount Everest","Himalayas","Mount_Everest"],
["994","AZ","Azerbaijan","Flame Towers","Baku","Flame_Towers"],
["998","UZ","Uzbekistan","Registan","Samarkand","Registan"],
];
const UA = {"User-Agent":"react-native-sip-voice-landmarks/0.1 (https://github.com/; open-source build script)"};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function getJson(url){ for(let i=0;i<8;i++){ const r=await fetch(url,{headers:UA}); const t=await r.text(); try { await sleep(3000); return JSON.parse(t);} catch { console.error("retry",i); await sleep(30000*(i+1)); } } throw new Error("rate limited"); }
const strip = s => (s||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
const titles=[...new Set(L.map(x=>x[5]))];
const fileByTitle={};
for (let i=0;i<titles.length;i+=45){
  const batch=titles.slice(i,i+45);
  const url=`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=name&pilicense=free&titles=${encodeURIComponent(batch.join("|"))}`;
  const j=await getJson(url);
  const norm={}; (j.query.normalized||[]).forEach(n=>norm[n.to]=n.from); const redir={}; (j.query.redirects||[]).forEach(n=>redir[n.to]=n.from);
  for (const p of j.query.pages){ let t=p.title; t=redir[t]||t; t=norm[t]||t; const key=batch.find(b=>b.replace(/_/g," ")===t.replace(/_/g," "))||t; if(p.pageimage) fileByTitle[key]=p.pageimage; else console.error("no free image",key); }
}
const files=[...new Set(Object.values(fileByTitle))];
const infoByFile={};
for (let i=0;i<files.length;i+=45){
  const batch=files.slice(i,i+45).map(f=>"File:"+f);
  const url=`https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1080&titles=${encodeURIComponent(batch.join("|"))}`;
  const j=await getJson(url);
  const norm={}; (j.query.normalized||[]).forEach(n=>norm[n.to]=n.from);
  for (const p of j.query.pages){ const ii=p.imageinfo?.[0]; const orig=(norm[p.title]||p.title).replace(/^File:/,""); if(!ii){console.error("not on commons",orig);continue;} const md=ii.extmetadata||{}; infoByFile[orig]={imageUrl:ii.thumburl||ii.url, sourcePage:ii.descriptionurl, author:strip(md.Artist?.value).slice(0,80), license:strip(md.LicenseShortName?.value)}; }
}
const out=[];
for (const [dial,iso,country,landmark,city,title] of L){ const f=fileByTitle[title]; const info=f && (infoByFile[f]||infoByFile[f.replace(/_/g," ")]); out.push(info?{dial,iso,country,landmark,city,...info}:{dial,iso,country,landmark,city}); if(!info) console.error("MISSING",title,f); }
(await import('fs')).writeFileSync('landmarks.json', JSON.stringify(out,null,1));
console.log("ok", out.filter(o=>o.imageUrl).length, "with images of", out.length);
