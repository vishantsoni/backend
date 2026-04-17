const pool = require('../config/db');

// Your complete States ID list
const states = [
  { id: 1, name: 'Andhra Pradesh' },
  { id: 2, name: 'Arunachal Pradesh' },
  { id: 3, name: 'Assam' },
  { id: 4, name: 'Bihar' },
  { id: 5, name: 'Chhattisgarh' },
  { id: 6, name: 'Goa' },
  { id: 7, name: 'Gujarat' },
  { id: 8, name: 'Haryana' },
  { id: 9, name: 'Himachal Pradesh' },
  { id: 10, name: 'Jharkhand' },
  { id: 11, name: 'Karnataka' },
  { id: 12, name: 'Kerala' },
  { id: 13, name: 'Madhya Pradesh' },
  { id: 14, name: 'Maharashtra' },
  { id: 15, name: 'Manipur' },
  { id: 16, name: 'Meghalaya' },
  { id: 17, name: 'Mizoram' },
  { id: 18, name: 'Nagaland' },
  { id: 19, name: 'Odisha' },
  { id: 20, name: 'Punjab' },
  { id: 21, name: 'Rajasthan' },
  { id: 22, name: 'Sikkim' },
  { id: 23, name: 'Tamil Nadu' },
  { id: 24, name: 'Telangana' },
  { id: 25, name: 'Tripura' },
  { id: 26, name: 'Uttar Pradesh' },
  { id: 27, name: 'Uttarakhand' },
  { id: 28, name: 'West Bengal' },
  { id: 29, name: 'Andaman and Nicobar Islands' },
  { id: 30, name: 'Chandigarh' },
  { id: 31, name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { id: 32, name: 'Delhi' },
  { id: 33, name: 'Jammu and Kashmir' },
  { id: 34, name: 'Ladakh' },
  { id: 35, name: 'Lakshadweep' },
  { id: 36, name: 'Puducherry' }
];

// Complete mapped city data based on your uploaded content
const citiesByStateId = {
  1: ["Adilabad", "Adoni", "Amadalavalasa", "Amalapuram", "Anakapalle", "Anantapur", "Badepalle", "Banganapalle", "Bapatla", "Bellampalle", "Bethamcherla", "Bhadrachalam", "Bhainsa", "Bheemunipatnam", "Bhimavaram", "Bhongir", "Bobbili", "Bodhan", "Chilakaluripet", "Chirala", "Chittoor", "Cuddapah", "Devarakonda", "Dharmavaram", "Eluru", "Farooqnagar", "Gadwal", "Gooty", "Gudivada", "Gudur", "Guntakal", "Guntur", "Hanuman Junction", "Hindupur", "Hyderabad", "Ichchapuram", "Jaggaiahpet", "Jagtial", "Jammalamadugu", "Jangaon", "Kadapa", "Kadiri", "Kagaznagar", "Kakinada", "Kalyandurg", "Kamareddy", "Kandukur", "Karimnagar", "Kavali", "Khammam", "Koratla", "Kothagudem", "Kothapeta", "Kovvur", "Kurnool", "Kyathampalle", "Macherla", "Machilipatnam", "Madanapalle", "Mahbubnagar", "Mancherial", "Mandamarri", "Mandapeta", "Manuguru", "Markapur", "Medak", "Miryalaguda", "Mogalthur", "Nagari", "Nagarkurnool", "Nandyal", "Narasapur", "Narasaraopet", "Narayanpet", "Narsipatnam", "Nellore", "Nidadavole", "Nirmal", "Nizamabad", "Nuzvid", "Ongole", "Palacole", "Palasa Kasibugga", "Palwancha", "Parvathipuram", "Pedana", "Peddapuram", "Pithapuram", "Pondur", "Ponnur", "Proddatur", "Punganur", "Puttur", "Rajahmundry", "Rajam", "Ramachandrapuram", "Ramagundam", "Rayachoti", "Rayadurg", "Renigunta", "Repalle", "Sadasivpet", "Salur", "Samalkot", "Sangareddy", "Sattenapalle", "Siddipet", "Singapur", "Sircilla", "Srikakulam", "Srikalahasti", "Suryapet", "Tadepalligudem", "Tadpatri", "Tandur", "Tanuku", "Tenali", "Tirupati", "Tuni", "Uravakonda", "Venkatagiri", "Vicarabad", "Vijayawada", "Vinukonda", "Visakhapatnam", "Vizianagaram", "Wanaparthy", "Warangal", "Yellandu", "Yemmiganur", "Yerraguntla", "Zahirabad", "Rajampet"],
  2: ["Along", "Bomdila", "Itanagar", "Naharlagun", "Pasighat"],
  3: ["Abhayapuri", "Amguri", "Anandnagaar", "Barpeta", "Barpeta Road", "Bilasipara", "Bongaigaon", "Dhekiajuli", "Dhubri", "Dibrugarh", "Digboi", "Diphu", "Dispur", "Gauripur", "Goalpara", "Golaghat", "Guwahati", "Haflong", "Hailakandi", "Hojai", "Jorhat", "Karimganj", "Kokrajhar", "Lanka", "Lumding", "Mangaldoi", "Mankachar", "Margherita", "Mariani", "Marigaon", "Nagaon", "Nalbari", "North Lakhimpur", "Rangia", "Sibsagar", "Silapathar", "Silchar", "Tezpur", "Tinsukia"],
  4: ["Amarpur", "Araria", "Areraj", "Arrah", "Asarganj", "Aurangabad", "Bagaha", "Bahadurganj", "Bairgania", "Bakhtiarpur", "Banka", "Banmankhi Bazar", "Barahiya", "Barauli", "Barbigha", "Barh", "Begusarai", "Behea", "Bettiah", "Bhabua", "Bhagalpur", "Bihar Sharif", "Bikramganj", "Bodh Gaya", "Buxar", "Chandan Bara", "Chanpatia", "Chhapra", "Colgong", "Dalsinghsarai", "Darbhanga", "Daudnagar", "Dehri-on-Sone", "Dhaka", "Dighwara", "Dumraon", "Fatwah", "Forbesganj", "Gaya", "Gogri Jamalpur", "Gopalganj", "Hajipur", "Hilsa", "Hisua", "Islampur", "Jagdispur", "Jamalpur", "Jamui", "Jehanabad", "Jhajha", "Jhanjharpur", "Jogabani", "Kanti", "Katihar", "Khagaria", "Kharagpur", "Kishanganj", "Lakhisarai", "Lalganj", "Madhepura", "Madhubani", "Maharajganj", "Mahnar Bazar", "Makhdumpur", "Maner", "Manihari", "Marhaura", "Masaurhi", "Mirganj", "Mokameh", "Motihari", "Motipur", "Munger", "Murliganj", "Muzaffarpur", "Narkatiaganj", "Naugachhia", "Nawada", "Nokha", "Patna", "Piro", "Purnia", "Rafiganj", "Rajgir", "Ramnagar", "Raxaul Bazar", "Revelganj", "Rosera", "Saharsa", "Samastipur", "Sasaram", "Sheikhpura", "Sheohar", "Sherghati", "Silao", "Sitamarhi", "Siwan", "Sonepur", "Sugauli", "Sultanganj", "Supaul", "Warisaliganj"],
  5: ["Ahiwara", "Akaltara", "Ambagarh Chowki", "Ambikapur", "Arang", "Bade Bacheli", "Balod", "Baloda Bazar", "Bemetra", "Bhatapara", "Bilaspur", "Birgaon", "Champa", "Chirmiri", "Dalli-Rajhara", "Dhamtari", "Dipka", "Dongargarh", "Durg-Bhilai Nagar", "Gobranawapara", "Jagdalpur", "Janjgir", "Jashpurnagar", "Kanker", "Kawardha", "Kondagaon", "Korba", "Mahasamund", "Mahendragarh", "Mungeli", "Naila Janjgir", "Raigarh", "Raipur", "Rajnandgaon", "Sakti", "Tilda Newra"],
  6: ["Aldona", "Curchorem Cacora", "Madgaon", "Mapusa", "Margao", "Marmagao", "Panaji"],
  7: ["Ahmedabad", "Amreli", "Anand", "Ankleshwar", "Bharuch", "Bhavnagar", "Bhuj", "Cambay", "Dahod", "Deesa", "Dholka", "Gandhinagar", "Godhra", "Himatnagar", "Idar", "Jamnagar", "Junagadh", "Kadi", "Kalavad", "Kalol", "Kapadvanj", "Karjan", "Keshod", "Khambhalia", "Khambhat", "Kheda", "Khedbrahma", "Kheralu", "Kodinar", "Lathi", "Limbdi", "Lunawada", "Mahesana", "Mahuva", "Manavadar", "Mandvi", "Mangrol", "Mansa", "Mehmedabad", "Modasa", "Morvi", "Nadiad", "Navsari", "Padra", "Palanpur", "Palitana", "Pardi", "Patan", "Petlad", "Porbandar", "Radhanpur", "Rajkot", "Rajpipla", "Rajula", "Ranavav", "Rapar", "Salaya", "Sanand", "Savarkundla", "Sidhpur", "Sihor", "Songadh", "Surat", "Talaja", "Thangadh", "Tharad", "Umbergaon", "Umreth", "Una", "Unjha", "Upleta", "Vadnagar", "Vadodara", "Valsad", "Vapi", "Veraval", "Vijapur", "Viramgam", "Visnagar", "Vyara", "Wadhwan", "Wankaner"],
  8: ["Ambala", "Asankhurd", "Assandh", "Ateli", "Babiyal", "Bahadurgarh", "Barwala", "Bhiwani", "Charkhi Dadri", "Cheeka", "Ellenabad 2", "Faridabad", "Fatehabad", "Ganaur", "Gharaunda", "Gohana", "Gurgaon", "Haibat(Yamuna Nagar)", "Hansi", "Hisar", "Hodal", "Jhajjar", "Jind", "Kaithal", "Kalan Wali", "Kalka", "Karnal", "Ladwa", "Mahendragarh", "Mandi Dabwali", "Narnaul", "Narwana", "Palwal", "Panchkula", "Panipat", "Pehowa", "Pinjore", "Rania", "Ratia", "Rewari", "Rohtak", "Safidon", "Samalkha", "Shahbad", "Sirsa", "Sohna", "Sonipat", "Taraori", "Thanesar", "Tohana", "Yamunanagar"],
  13: ["Ashok Nagar", "Balaghat", "Betul", "Bhopal", "Burhanpur", "Chhatarpur", "Dabra", "Datia", "Dewas", "Dhar", "Fatehabad", "Gwalior", "Indore", "Itarsi", "Jabalpur", "Katni", "Kotma", "Lahar", "Lundi", "Maharajpur", "Mahidpur", "Maihar", "Malajkhand", "Manasa", "Manawar", "Mandideep", "Mandla", "Mandsaur", "Mauganj", "Mhow Cantonment", "Mhowgaon", "Morena", "Multai", "Murwara", "Nagda", "Nainpur", "Narsinghgarh", "Neemuch", "Nepanagar", "Niwari", "Nowgong", "Nowrozabad", "Pachore", "Pali", "Panagar", "Pandhurna", "Panna", "Pasan", "Pipariya", "Pithampur", "Porsa", "Prithvipur", "Raghogarh-Vijaypur", "Rahatgarh", "Raisen", "Rajgarh", "Ratlam", "Rau", "Rehli", "Rewa", "Sabalgarh", "Sagar", "Sanawad", "Sarangpur", "Sarni", "Satna", "Sausar", "Sehore", "Sendhwa", "Seoni", "Seoni-Malwa", "Shahdol", "Shajapur", "Shamgarh", "Sheopur", "Shivpuri", "Shujalpur", "Sidhi", "Sihora", "Singrauli", "Sironj", "Sohagpur", "Tarana", "Tikamgarh", "Ujhani", "Ujjain", "Umaria", "Vidisha", "Wara Seoni"],
  14: ["Kolhapur", "Ahmednagar", "Akola", "Amravati", "Aurangabad", "Baramati", "Chalisgaon", "Chinchani", "Devgarh", "Dhule", "Dombivli", "Durgapur", "Ichalkaranji", "Jalna", "Kalyan", "Latur", "Loha", "Lonar", "Lonavla", "Mahad", "Mahuli", "Malegaon", "Malkapur", "Manchar", "Mangalvedhe", "Mangrulpir", "Manjlegaon", "Manmad", "Manwath", "Mehkar", "Mhaswad", "Miraj", "Morshi", "Mukhed", "Mul", "Mumbai", "Murtijapur", "Nagpur", "Nalasopara", "Nanded-Waghala", "Nandgaon", "Nandura", "Nandurbar", "Narkhed", "Nashik", "Navi Mumbai", "Nawapur", "Nilanga", "Osmanabad", "Ozar", "Pachora", "Paithan", "Palghar", "Pandharkaoda", "Pandharpur", "Panvel", "Parbhani", "Parli", "Parola", "Partur", "Pathardi", "Pathri", "Patur", "Pauni", "Pen", "Phaltan", "Pulgaon", "Pune", "Purna", "Pusad", "Rahuri", "Rajura", "Ramtek", "Ratnagiri", "Raver", "Risod", "Sailu", "Sangamner", "Sangli", "Sangole", "Sasvad", "Satana", "Satara", "Savner", "Sawantwadi", "Shahade", "Shegaon", "Shendurjana", "Shirdi", "Shirpur-Warwade", "Shirur", "Shrigonda", "Shrirampur", "Sillod", "Sinnar", "Solapur", "Soyagaon", "Talegaon Dabhade", "Talode", "Tasgaon", "Tirora", "Tuljapur", "Tumsar", "Uran", "Uran Islampur", "Wadgaon Road", "Wai", "Wani", "Wardha", "Warora", "Warud", "Washim", "Yevla", "Uchgaon", "Udgir", "Umarga", "Umarkhed", "Umred", "Vadgaon Kasba", "Vaijapur", "Vasai", "Virar", "Vita", "Yavatmal", "Yawal"],
  26: ["Achhnera", "Adari", "Agra", "Aligarh", "Allahabad", "Amroha", "Azamgarh", "Bahraich", "Ballia", "Balrampur", "Banda", "Bareilly", "Chandausi", "Dadri", "Deoria", "Etawah", "Fatehabad", "Fatehpur", "Greater Noida", "Hamirpur", "Hardoi", "Jajmau", "Jaunpur", "Jhansi", "Kalpi", "Kanpur", "Kota", "Laharpur", "Lakhimpur", "Lal Gopalganj Nindaura", "Lalganj", "Lalitpur", "Lar", "Loni", "Lucknow", "Mathura", "Meerut", "Modinagar", "Muradnagar", "Nagina", "Najibabad", "Nakur", "Nanpara", "Naraura", "Naugawan Sadat", "Nautanwa", "Nawabganj", "Nehtaur", "NOIDA", "Noorpur", "Obra", "Orai", "Padrauna", "Palia Kalan", "Parasi", "Phulpur", "Pihani", "Pilibhit", "Pilkhuwa", "Powayan", "Pukhrayan", "Puranpur", "Purquazi", "Purwa", "Rae Bareli", "Rampur", "Rampur Maniharan", "Rasra", "Rath", "Renukoot", "Reoti", "Robertsganj", "Rudauli", "Rudrapur", "Sadabad", "Safipur", "Saharanpur", "Sahaspur", "Sahaswan", "Sahawar", "Sahjanwa", "Saidpur", "Sambhal", "Samdhan", "Samthar", "Sandi", "Sandila", "Sardhana", "Seohara", "Shahabad", "Shahganj", "Shahjahanpur", "Shamli", "Shamsabad", "Sherkot", "Shikarpur", "Shikohabad", "Shishgarh", "Siana", "Sikanderpur", "Sikandra Rao", "Sikandrabad", "Sirsaganj", "Sirsi", "Sitapur", "Soron", "Suar", "Sultanpur", "Sumerpur", "Tanda", "Tetri Bazar", "Thakurdwara", "Thana Bhawan", "Tilhar", "Tirwaganj", "Tulsipur", "Tundla", "Unnao", "Utraula", "Varanasi", "Vrindavan", "Warhapur", "Zaidpur", "Zamania", "Muzaffarnagar"],
  28: ["Alipurduar", "Arambagh", "Asansol", "Baharampur", "Bally", "Balurghat", "Bankura", "Barakar", "Barasat", "Bardhaman", "Bidhan Nagar", "Chinsura", "Contai", "Cooch Behar", "Darjeeling", "Durgapur", "Haldia", "Howrah", "Islampur", "Jhargram", "Kharagpur", "Kolkata", "Mainaguri", "Mal", "Mathabhanga", "Medinipur", "Memari", "Monoharpur", "Murshidabad", "Nabadwip", "Naihati", "Panchla", "Pandua", "Paschim Punropara", "Purulia", "Raghunathpur", "Raiganj", "Rampurhat", "Ranaghat", "Sainthia", "Santipur", "Siliguri", "Sonamukhi", "Srirampore", "Suri", "Taki", "Tamluk", "Tarakeswar"]
};

// Map to look up state name by ID for logging purposes
const stateNamesById = states.reduce((acc, state) => {
  acc[state.id] = state.name;
  return acc;
}, {});

async function seedStates() {
  console.log('🌱 Seeding states...');
  for (const state of states) {
    await pool.query(
      `INSERT INTO states (name, status) VALUES ($1, 'active') ON CONFLICT (name) DO NOTHING`,
      [state.name]
    );
  }
}

async function seedCities() {
  console.log('🌆 Seeding cities...');
  for (const [stateIdStr, cityList] of Object.entries(citiesByStateId)) {
    const originalStateId = parseInt(stateIdStr);
    const stateName = stateNamesById[originalStateId];

    // Find the correct DB ID for the state
    const stateRes = await pool.query('SELECT id FROM states WHERE name = $1', [stateName]);
    if (stateRes.rows.length === 0) {
      console.warn(`⚠️ State "${stateName}" not found in DB.`);
      continue;
    }
    const dbStateId = stateRes.rows[0].id;

    console.log(`📍 Processing ${cityList.length} cities for ${stateName}...`);

    for (const cityName of cityList) {
      await pool.query(
        `INSERT INTO cities (state_id, name, status) VALUES ($1, $2, 'active') ON CONFLICT (state_id, name) DO NOTHING`,
        [dbStateId, cityName]
      );
    }
  }
}

async function main() {
  try {
    await seedStates();
    console.log('✅ States seeded');

    await seedCities();
    console.log('✅ Cities seeded');

    const stateCount = await pool.query('SELECT COUNT(*)::int FROM states');
    const cityCount = await pool.query('SELECT COUNT(*)::int FROM cities');
    console.log(`📊 Total verification: ${stateCount.rows[0].count} states, ${cityCount.rows[0].count} cities.`);
    
    console.log('🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

main();