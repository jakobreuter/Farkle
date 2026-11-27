// Close Call — pure rules. Everyone guesses a number, the guesses become betting
// slots on a number line, and chips ride on whichever guess lands closest to the
// answer WITHOUT going over it (or on "All too high" if every guess overshot).

// ---------- question bank ----------
// [question, answer, unit, fun fact, difficulty 1-3, kind] — kind 'y' = a year
const Y = 'y';
export const BANK = [
  // ----- years -----
  ['In what year did the Titanic sink?', 1912, 'year', 'It went down on its very first voyage, four days after leaving Southampton.', 1, Y],
  ['In what year did people first walk on the Moon?', 1969, 'year', 'Apollo 11’s lunar module was named Eagle; the crew spent about 21 hours on the surface.', 1, Y],
  ['In what year did the Berlin Wall fall?', 1989, 'year', 'The wall had divided the city for 28 years.', 1, Y],
  ['In what year did Columbus first reach the Americas?', 1492, 'year', 'He landed in the Bahamas, believing he had reached Asia.', 1, Y],
  ['In what year was the US Declaration of Independence adopted?', 1776, 'year', 'It was adopted on July 4th in Philadelphia.', 1, Y],
  ['In what year did the Wright brothers make their first powered flight?', 1903, 'year', 'The first flight at Kitty Hawk lasted just 12 seconds.', 2, Y],
  ['In what year were the first modern Olympic Games held in Athens?', 1896, 'year', 'Winners received a silver medal and an olive branch — not gold.', 2, Y],
  ['In what year was the Eiffel Tower completed?', 1889, 'year', 'It was built as the entrance arch for a World’s Fair and was meant to be temporary.', 2, Y],
  ['In what year did World War I begin?', 1914, 'year', 'It was called “the Great War” until a second one came along.', 1, Y],
  ['In what year did World War II end?', 1945, 'year', 'Fighting in Europe ended in May; the war in the Pacific ended in September.', 1, Y],
  ['In what year was the Magna Carta sealed?', 1215, 'year', 'King John sealed it at Runnymede, near the River Thames.', 3, Y],
  ['In what year was the Battle of Hastings fought?', 1066, 'year', 'The Bayeux Tapestry telling its story is about 70 metres long.', 2, Y],
  ['In what year was William Shakespeare born?', 1564, 'year', 'He was born in Stratford-upon-Avon — and died there too.', 3, Y],
  ['In what year was the Bastille stormed, starting the French Revolution?', 1789, 'year', 'July 14th is still France’s national day.', 2, Y],
  ['In what year was the first iPhone released?', 2007, 'year', 'It had no app store at launch — that arrived a year later.', 1, Y],
  ['In what year was Sputnik, the first artificial satellite, launched?', 1957, 'year', 'It was about the size of a beach ball and beeped as it orbited.', 2, Y],
  ['In what year did euro banknotes and coins go into circulation?', 2002, 'year', 'The euro existed for three years before that as an electronic currency only.', 2, Y],
  ['In what year did the Chernobyl nuclear disaster happen?', 1986, 'year', 'The nearby city of Pripyat was evacuated and is still abandoned.', 2, Y],
  ['In what year did Mount Vesuvius bury Pompeii?', 79, 'year (AD)', 'The ash preserved the city so well that bread loaves were found in ovens.', 3, Y],
  ['In what year was the Great Fire of London?', 1666, 'year', 'It burned for about four days and destroyed over 13,000 houses.', 2, Y],
  ['In what year was the Battle of Waterloo?', 1815, 'year', 'It ended Napoleon’s rule for good; he was exiled to Saint Helena.', 2, Y],
  ['In what year did Lincoln give the Gettysburg Address?', 1863, 'year', 'The speech is only about 270 words long.', 3, Y],
  ['In what year did Darwin publish “On the Origin of Species”?', 1859, 'year', 'The first printing sold out on its first day.', 3, Y],
  ['In what year was the first Star Wars film released?', 1977, 'year', 'It was later retitled “Episode IV – A New Hope”.', 1, Y],
  ['In what year did Disneyland open in California?', 1955, 'year', 'Opening day was so chaotic that staff later nicknamed it “Black Sunday”.', 2, Y],
  ['In what year did the 19th Amendment give US women the vote?', 1920, 'year', 'New Zealand had given women the vote back in 1893.', 2, Y],
  ['In what year was Nelson Mandela released from prison?', 1990, 'year', 'He had been imprisoned for 27 years.', 2, Y],
  ['In what year did the Panama Canal open?', 1914, 'year', 'Ships are lifted about 26 metres by locks to cross it.', 3, Y],
  ['In what year was the first FIFA World Cup played?', 1930, 'year', 'Uruguay hosted it — and won it.', 2, Y],
  ['In what year was the Mona Lisa stolen from the Louvre?', 1911, 'year', 'It was missing for over two years before turning up in Florence.', 3, Y],
  ['In what year did Alexander Fleming discover penicillin?', 1928, 'year', 'He noticed mould killing bacteria in a dish he had left out while on holiday.', 3, Y],
  ['In what year was the Hubble Space Telescope launched?', 1990, 'year', 'Its first images were blurry — astronauts fitted corrective optics in 1993.', 2, Y],
  ['In what year was Wolfgang Amadeus Mozart born?', 1756, 'year', 'He wrote his first compositions at about five years old.', 3, Y],
  ['In what year did the Soviet Union dissolve?', 1991, 'year', 'It split into 15 independent countries.', 2, Y],
  ['In what year was the first Harry Potter book published?', 1997, 'year', 'Several publishers turned the manuscript down first.', 1, Y],
  ['In what year was the Statue of Liberty dedicated?', 1886, 'year', 'It was a gift from France and arrived in 350 pieces.', 2, Y],
  ['In what year did Einstein publish special relativity?', 1905, 'year', 'He published four groundbreaking papers that year, often called his “miracle year”.', 3, Y],
  ['In what year did Yuri Gagarin become the first person in space?', 1961, 'year', 'His single orbit of Earth took about 108 minutes.', 2, Y],
  ['In what year did the Golden Gate Bridge open?', 1937, 'year', 'Its famous color is called “International Orange”.', 2, Y],
  ['In what year did the Channel Tunnel between England and France open?', 1994, 'year', 'Its undersea section is the longest of any tunnel in the world.', 2, Y],
  ['In what year did Victoria become Queen of the United Kingdom?', 1837, 'year', 'She was just 18 years old.', 3, Y],
  ['In what year did Martin Luther publish his 95 Theses?', 1517, 'year', 'It kicked off the Protestant Reformation.', 3, Y],
  ['In what year did the United States buy Alaska from Russia?', 1867, 'year', 'Critics mocked the deal as “Seward’s Folly”.', 3, Y],
  ['In what year was Pluto discovered?', 1930, 'year', 'Its name was suggested by an 11-year-old girl in England.', 3, Y],
  ['In what year was the first Tour de France raced?', 1903, 'year', 'It was created by a newspaper to boost its sales.', 3, Y],
  ['In what year was the wreck of the Titanic found?', 1985, 'year', 'It lies about 3,800 metres below the surface.', 2, Y],
  ['In what year did Mount St. Helens erupt?', 1980, 'year', 'The eruption blew about 400 metres off the top of the mountain.', 2, Y],
  ['In what year were the first Nobel Prizes awarded?', 1901, 'year', 'Alfred Nobel, who funded them, invented dynamite.', 2, Y],
  ['In what year did the Brooklyn Bridge open?', 1883, 'year', 'P. T. Barnum led 21 elephants across it to prove it was sturdy.', 3, Y],
  ['In what year was the first Super Bowl played?', 1967, 'year', 'Tickets for it cost about 12 dollars.', 2, Y],
  ['In what year was Google founded?', 1998, 'year', 'It started in a rented garage in Menlo Park, California.', 1, Y],
  ['In what year did the Wall Street Crash happen?', 1929, 'year', 'It helped set off the Great Depression.', 2, Y],
  ['In what year did the Beatles first play on American TV’s Ed Sullivan Show?', 1964, 'year', 'About 73 million people watched.', 2, Y],
  ['In what year did Tim Berners-Lee propose the World Wide Web?', 1989, 'year', 'He wrote the proposal while working at CERN, the physics lab near Geneva.', 3, Y],
  ['In what year did the Hundred Years’ War begin?', 1337, 'year', 'It actually lasted 116 years.', 3, Y],
  ['In what year BC was Julius Caesar assassinated?', 44, 'year (BC)', 'He was stabbed on the Ides of March — the 15th.', 3, Y],
  ['In what year did the Titanic’s sister ship, the Olympic, enter service?', 1911, 'year', 'The Olympic served for 24 years and earned the nickname “Old Reliable”.', 3, Y],
  ['In what year was the Sydney Opera House opened?', 1973, 'year', 'Its roof is covered with over a million tiles.', 3, Y],
  ['In what year did the first Moon rover drive on the Moon?', 1971, 'year', 'It was a battery-powered buggy that folded up for the trip.', 3, Y],
  ['In what year did Queen Elizabeth II become queen?', 1952, 'year', 'She learned the news while visiting Kenya.', 2, Y],

  // ----- landmarks & distances -----
  ['How tall is the Burj Khalifa, in metres?', 828, 'metres', 'It has been the tallest building in the world since 2010.', 2],
  ['How tall is Mount Everest, in metres (2020 survey)?', 8849, 'metres', 'Its summit is slowly rising — the Himalayas are still growing.', 2],
  ['How tall is the Statue of Liberty from the ground to the tip of the torch, in metres?', 93, 'metres', 'The statue alone is about 46 m; the pedestal makes up the rest.', 3],
  ['How tall is the Empire State Building to its roof, in metres?', 381, 'metres', 'It was built in about 13 months.', 3],
  ['How many metres long is a marathon?', 42195, 'metres', 'The odd distance dates back to the 1908 London Olympics route.', 3],
  ['How long is an Olympic swimming pool, in metres?', 50, 'metres', 'It holds roughly 2.5 million litres of water.', 1],
  ['How tall was the Great Pyramid of Giza when built, in metres?', 146, 'metres', 'It was the tallest human-made structure for nearly 4,000 years.', 3],
  ['How far is the Moon from Earth on average, in kilometres?', 384400, 'km', 'Light makes the trip in about 1.3 seconds.', 3],
  ['How fast does light travel, in kilometres per second?', 299792, 'km/s', 'It could circle Earth about 7.5 times in one second.', 3],
  ['How long is Earth’s equator, in kilometres?', 40075, 'km', 'The metre was originally defined from the size of the Earth.', 3],
  ['How tall is the Elizabeth Tower (home of Big Ben), in metres?', 96, 'metres', 'Big Ben is actually the name of the great bell inside.', 3],
  ['How tall is the Leaning Tower of Pisa, in metres (to the nearest metre)?', 56, 'metres', 'It started leaning while it was still being built.', 3],
  ['How long is the main span of the Golden Gate Bridge, in metres?', 1280, 'metres', 'It was the longest suspension span in the world when it opened.', 3],
  ['How tall is the Christ the Redeemer statue in Rio, not counting its pedestal, in metres?', 30, 'metres', 'Its outstretched arms span about 28 metres.', 2],
  ['How tall is Mount Kilimanjaro, in metres?', 5895, 'metres', 'It is the tallest free-standing mountain in the world.', 3],
  ['How tall is Mount Fuji, in metres?', 3776, 'metres', 'It is an active volcano — it last erupted in 1707.', 3],
  ['How tall is Angel Falls in Venezuela, the world’s highest waterfall, in metres?', 979, 'metres', 'Much of the water turns to mist before reaching the bottom.', 3],
  ['How tall is Toronto’s CN Tower, in metres?', 553, 'metres', 'Brave visitors can walk around the outside of it on a ledge.', 3],
  ['How tall is Taipei 101, in metres?', 508, 'metres', 'A giant 660-tonne ball inside it steadies the tower in strong winds.', 3],
  ['How tall is Seattle’s Space Needle, in metres?', 184, 'metres', 'It was built for the 1962 World’s Fair.', 3],
  ['How deep is Lake Baikal, the world’s deepest lake, at its deepest point, in metres?', 1642, 'metres', 'It holds about a fifth of the world’s unfrozen fresh surface water.', 3],
  ['How far is it from the bowling foul line to the head pin, in feet?', 60, 'feet', 'The pins are set in a triangle of 10.', 3],
  ['How high is a basketball hoop, in feet?', 10, 'feet', 'Peach baskets were used in the very first games.', 1],
  ['How far is the soccer penalty spot from the goal line, in yards?', 12, 'yards', 'That’s about 11 metres.', 2],
  ['How long is a cricket pitch, in yards?', 22, 'yards', 'That distance is called a “chain”, an old surveying unit.', 2],
  ['How wide is a soccer goal, in feet?', 24, 'feet', 'It’s 8 feet tall — so 8 yards wide by 8 feet high.', 2],
  ['How long is an American football field including both end zones, in yards?', 120, 'yards', 'Each end zone is 10 yards deep.', 2],
  ['How many feet are in a mile?', 5280, 'feet', 'A mile was originally 1,000 paces of a Roman soldier.', 2],
  ['How many yards are in a mile?', 1760, 'yards', 'That’s eight “furlongs”, still used in horse racing.', 2],
  ['What is Earth’s average diameter, in kilometres?', 12742, 'km', 'Earth bulges slightly at the equator because it spins.', 3],
  ['How fast does sound travel in air at about room temperature, in metres per second?', 343, 'm/s', 'Count the seconds between lightning and thunder and divide by 3 for kilometres.', 3],

  // ----- animals & the body -----
  ['How many hearts does an octopus have?', 3, 'hearts', 'Its blood is blue because it uses copper to carry oxygen.', 2],
  ['How many legs does a spider have?', 8, 'legs', 'Most spiders also have eight eyes.', 1],
  ['How many legs does a lobster have, counting its claws?', 10, 'legs', 'Lobsters taste with their legs.', 2],
  ['How many teeth does a typical adult human have, counting wisdom teeth?', 32, 'teeth', 'Tooth enamel is the hardest substance in the human body.', 1],
  ['How many bones are in the adult human body?', 206, 'bones', 'Babies are born with around 300 — many fuse together as they grow.', 2],
  ['How many bones are in one human hand, including the wrist?', 27, 'bones', 'Together your hands and feet hold over half the bones in your body.', 3],
  ['How many months is an African elephant’s pregnancy?', 22, 'months', 'It’s the longest pregnancy of any land animal.', 3],
  ['How many humps does a dromedary camel have?', 1, 'hump', 'The hump stores fat, not water.', 1],
  ['How many arms does a typical starfish have?', 5, 'arms', 'A starfish can regrow a lost arm.', 1],
  ['How many chambers does a cow’s stomach have?', 4, 'chambers', 'Cows chew their food twice — once more after bringing it back up.', 2],
  ['How many eyes does a honeybee have?', 5, 'eyes', 'Two big compound eyes, plus three tiny ones on top of its head.', 3],
  ['How many bones are in a giraffe’s neck?', 7, 'vertebrae', 'The same number as in a human neck — they’re just much bigger.', 2],
  ['How many teeth does an adult dog have?', 42, 'teeth', 'Puppies have 28 baby teeth.', 3],
  ['How many claws does a typical cat have in total?', 18, 'claws', 'Five on each front paw, four on each back paw.', 3],
  ['How many wings does a bee have?', 4, 'wings', 'A honeybee’s wings beat about 200 times per second.', 2],
  ['How many arms and tentacles does a squid have in total?', 10, 'limbs', 'Eight arms plus two longer feeding tentacles.', 2],
  ['How many baby teeth does a child usually have?', 20, 'teeth', 'They start forming before birth.', 2],
  ['How many chromosomes are in a typical human cell?', 46, 'chromosomes', 'They come in 23 pairs — one of each pair from each parent.', 2],
  ['What is normal human body temperature, in degrees Celsius?', 37, '°C', 'Body temperature is usually a little lower in the morning.', 1],
  ['How many bones are in the human skull?', 22, 'bones', 'The only skull bone that moves freely is the lower jaw.', 3],
  ['How many ribs does a typical human have in total?', 24, 'ribs', 'That’s 12 pairs, for men and women alike.', 2],
  ['How many legs does an insect have?', 6, 'legs', 'Insects also always have three body parts.', 1],
  ['How many legs does a crab have, counting its claws?', 10, 'legs', 'Most crabs walk sideways.', 2],
  ['How many tentacles does an octopus have?', 8, 'arms', 'Scientists call them arms — about two-thirds of its neurons are in them.', 1],
  ['How many species of penguin live naturally in the Northern Hemisphere?', 1, 'species', 'Only the Galápagos penguin — and it barely crosses the equator.', 3],
  ['How many toes does an ostrich have on each foot?', 2, 'toes', 'It’s the only bird with just two toes per foot.', 3],
  ['How many hearts does an earthworm have (heart-like pumps)?', 5, 'pumps', 'Its five “aortic arches” pump blood around its body.', 3],
  ['How many legs does a centipede have on each body segment?', 2, 'legs', 'No centipede has exactly 100 legs — they always have an odd number of pairs.', 3],

  // ----- geography & civics -----
  ['How many states are in the United States?', 50, 'states', 'Hawaii was the last to join, in 1959.', 1],
  ['How many countries are in Africa?', 54, 'countries', 'Africa has more countries than any other continent.', 2],
  ['How many continents are there (by the common 7-continent count)?', 7, 'continents', 'Antarctica is the only one with no permanent residents.', 1],
  ['How many provinces does Canada have?', 10, 'provinces', 'It also has 3 territories in the north.', 2],
  ['How many countries share a land border with Germany?', 9, 'countries', 'More than any other country in Europe except Russia.', 3],
  ['How many states does Australia have?', 6, 'states', 'It also has two main mainland territories.', 2],
  ['How many Great Lakes are there in North America?', 5, 'lakes', 'Lake Superior alone could hold all the others — and three more Lake Eries.', 1],
  ['How many sovereign countries are in South America?', 12, 'countries', 'Brazil alone covers almost half the continent.', 2],
  ['How many stripes are on the US flag?', 13, 'stripes', 'One for each of the original 13 colonies.', 1],
  ['How many main islands make up the state of Hawaii?', 8, 'islands', 'The Big Island is still growing thanks to active volcanoes.', 3],
  ['How many cantons does Switzerland have?', 26, 'cantons', 'Switzerland has four national languages.', 3],
  ['How many US states border Canada (counting Alaska)?', 13, 'states', 'The US–Canada border is the longest international border in the world.', 3],
  ['How many sides does the Pentagon building have?', 5, 'sides', 'It also has five floors above ground and five rings of corridors.', 1],
  ['How many member states does the United Nations have?', 193, 'countries', 'South Sudan was the most recent to join, in 2011.', 3],
  ['How many countries make up the United Kingdom?', 4, 'countries', 'England, Scotland, Wales and Northern Ireland.', 1],
  ['How many time zones does the contiguous United States span?', 4, 'zones', 'Railroads pushed for standard time zones in the 1880s.', 2],
  ['How many senators sit in the US Senate?', 100, 'senators', 'Two per state, no matter the state’s size.', 2],
  ['How many seats are in the US House of Representatives?', 435, 'seats', 'That number has been fixed since 1913 (apart from a brief bump).', 3],
  ['How many justices sit on the US Supreme Court?', 9, 'justices', 'The number is set by law, not the Constitution.', 2],
  ['How many amendments make up the US Bill of Rights?', 10, 'amendments', 'They were ratified in 1791.', 2],
  ['How many men signed the US Declaration of Independence?', 56, 'signers', 'John Hancock’s signature is famously the largest.', 3],
  ['How many presidents are carved into Mount Rushmore?', 4, 'faces', 'Each face is about 18 metres tall.', 1],
  ['How many Wonders of the Ancient World were there?', 7, 'wonders', 'Only the Great Pyramid of Giza still stands.', 1],
  ['How many original colonies formed the United States?', 13, 'colonies', 'Delaware was the first to ratify the Constitution.', 1],
  ['How many territories does Canada have?', 3, 'territories', 'Nunavut, the newest, was created in 1999.', 2],

  // ----- sports & games -----
  ['How many players does each soccer team have on the field?', 11, 'players', 'Including the goalkeeper.', 1],
  ['How many players does each basketball team have on the court?', 5, 'players', 'Basketball was invented in 1891 by a PE teacher.', 1],
  ['How many players does each rugby union team have on the field?', 15, 'players', 'Rugby league uses 13 instead.', 2],
  ['How many holes are in a standard round of golf?', 18, 'holes', 'The Old Course at St Andrews once had 22.', 1],
  ['How many points is a touchdown worth in American football?', 6, 'points', 'A kick afterwards can add one more.', 1],
  ['What is a perfect score in ten-pin bowling?', 300, 'points', 'It takes 12 strikes in a row.', 2],
  ['What is the maximum break in snooker (without a free ball)?', 147, 'points', 'Fifteen reds with blacks, then all the colors.', 3],
  ['How many squares are on a chessboard?', 64, 'squares', 'There are more possible chess games than atoms in the observable universe.', 1],
  ['How many rings are on the Olympic flag?', 5, 'rings', 'At least one of its colors appears on every nation’s flag.', 1],
  ['How many players does a baseball team have on the field?', 9, 'players', 'A regulation game lasts nine innings too.', 1],
  ['How many minutes of regulation play are in an NBA game?', 48, 'minutes', 'Four quarters of 12 minutes each.', 2],
  ['How many players does each ice hockey team have on the ice, including the goalie?', 6, 'players', 'A hockey puck is frozen before games so it bounces less.', 2],
  ['What is the highest score possible with three darts?', 180, 'points', 'Three treble-20s.', 2],
  ['How many pieces does each chess player start with?', 16, 'pieces', 'Eight of them are pawns.', 1],
  ['How many balls are on the table at the start of 8-ball pool, including the cue ball?', 16, 'balls', 'Fifteen numbered balls plus the white.', 2],
  ['How many balls are bowled in one over of cricket?', 6, 'balls', 'Not counting no-balls and wides.', 2],
  ['How many events are in an Olympic decathlon?', 10, 'events', 'They are spread over two days.', 1],
  ['How many dots are on a standard six-sided die in total?', 21, 'dots', 'Opposite faces always add up to 7.', 2],
  ['How many tiles are in a double-six domino set?', 28, 'tiles', 'Every pair of numbers from 0 to 6 appears exactly once.', 3],
  ['How many cards are in a standard deck, without jokers?', 52, 'cards', 'Add up the values of all cards (J=11, Q=12, K=13) and you get 364.', 1],
  ['How many squares are on a standard Scrabble board?', 225, 'squares', 'It’s a 15 × 15 grid.', 3],
  ['How many letter tiles are in a standard English Scrabble set?', 100, 'tiles', 'Including two blank tiles.', 3],
  ['How many colored stickers are on a classic Rubik’s Cube?', 54, 'stickers', 'Nine on each of its six faces.', 2],
  ['How many spaces are around the edge of a classic property-trading board game board?', 40, 'spaces', 'Including the four corners.', 3],
  ['How many faces does a dodecahedron have?', 12, 'faces', 'Each face is a pentagon.', 2],
  ['How many different pieces (shapes) are there in the classic falling-blocks game?', 7, 'shapes', 'Each is made of four squares — a “tetromino”.', 2],
  ['How many pockets are on a European roulette wheel?', 37, 'pockets', 'Numbers 1 to 36 plus a single zero.', 3],
  ['How many cards are in a full tarot deck?', 78, 'cards', '22 major arcana and 56 minor arcana.', 3],
  ['How many tiles are in a standard mahjong set (with flowers and seasons)?', 144, 'tiles', 'Each regular tile appears four times.', 3],
  ['How many squares are in a full Sudoku grid?', 81, 'squares', 'A well-made puzzle has exactly one solution.', 2],
  ['How many squares does a Connect-four style board have (7 × 6)?', 42, 'holes', 'The first player can always win with perfect play.', 2],
  ['How many minutes long is a regular soccer match, excluding stoppage time?', 90, 'minutes', 'Two halves of 45 minutes.', 1],
  ['How many Olympic gold medals did swimmer Michael Phelps win in his career?', 23, 'golds', 'He won 8 of them at a single Games, in 2008.', 3],
  ['How many sets can a men’s Grand Slam tennis match last at most?', 5, 'sets', 'The longest match ever lasted 11 hours over three days.', 2],
  ['What is the highest checkout (finishing score) possible in darts?', 170, 'points', 'Treble 20, treble 20, then the bullseye.', 3],

  // ----- science & space -----
  ['How many elements are on the periodic table?', 118, 'elements', 'The last four were officially named in 2016.', 2],
  ['What is the atomic number of gold?', 79, '', 'Its symbol, Au, comes from the Latin word “aurum”.', 3],
  ['What is the atomic number of carbon?', 6, '', 'Carbon is in every known living thing.', 2],
  ['At what temperature does water boil at sea level, in °F?', 212, '°F', 'Higher up a mountain, water boils at a lower temperature.', 2],
  ['At what temperature does water freeze, in °F?', 32, '°F', 'Salt water freezes at a lower temperature.', 1],
  ['How many planets are in our solar system?', 8, 'planets', 'Pluto was reclassified as a dwarf planet in 2006.', 1],
  ['How many moons does Mars have?', 2, 'moons', 'They’re called Phobos and Deimos — “fear” and “dread”.', 2],
  ['How many Earth days does Mars take to orbit the Sun?', 687, 'days', 'A day on Mars is only about 40 minutes longer than ours.', 3],
  ['How many Earth days does Mercury take to orbit the Sun?', 88, 'days', 'Mercury is the fastest planet in the solar system.', 3],
  ['How many Apollo missions landed people on the Moon?', 6, 'missions', 'Apollo 13 had to turn back after an explosion.', 2],
  ['How many people have walked on the Moon?', 12, 'people', 'All of them between 1969 and 1972.', 2],
  ['How many degrees are in a full circle?', 360, 'degrees', 'The number may come from ancient Babylonian astronomy.', 1],
  ['How many edges does a cube have?', 12, 'edges', 'It also has 8 corners and 6 faces.', 2],
  ['How many prime numbers are there below 100?', 25, 'primes', 'The largest is 97.', 3],
  ['How many zeros are in a googol?', 100, 'zeros', 'A popular search engine’s name is a play on this word.', 2],
  ['How many zeros are in one billion?', 9, 'zeros', 'In older British usage a billion once meant a million million.', 1],
  ['How many bytes are in a kibibyte (the “binary” kilobyte)?', 1024, 'bytes', 'That’s 2 to the power of 10.', 2],
  ['How many colors are in a traditional rainbow?', 7, 'colors', 'Isaac Newton picked seven to match the musical scale.', 1],
  ['How many sides does a stop sign have?', 8, 'sides', 'An eight-sided shape is called an octagon.', 1],
  ['What do the angles of a triangle add up to, in degrees?', 180, 'degrees', 'True on a flat surface — not on a sphere!', 1],
  ['How many sides does a hexagon have?', 6, 'sides', 'Bees build hexagons because they pack with no wasted space.', 1],
  ['How many vertices (corners) does a cube have?', 8, 'corners', 'Corners minus edges plus faces always equals 2 for shapes like this.', 2],

  // ----- time & measures -----
  ['How many days are in a leap year?', 366, 'days', 'February 29th babies only get a “real” birthday every four years.', 1],
  ['How many minutes are in a day?', 1440, 'minutes', 'That’s 24 × 60.', 2],
  ['How many seconds are in an hour?', 3600, 'seconds', 'That’s 60 × 60.', 1],
  ['How many hours are in a week?', 168, 'hours', 'That’s 7 × 24.', 2],
  ['How many seconds are in a day?', 86400, 'seconds', 'Every so often a “leap second” has been added to keep clocks in step with Earth.', 3],
  ['How many weeks are in a year (whole weeks)?', 52, 'weeks', 'Plus one or two spare days.', 1],
  ['How many ounces are in a pound?', 16, 'ounces', 'The “oz” abbreviation comes from the old Italian word “onza”.', 2],
  ['How many inches are in a yard?', 36, 'inches', 'Three feet of 12 inches each.', 2],
  ['How many US pints are in a US gallon?', 8, 'pints', 'Four quarts, each two pints.', 2],
  ['How many pounds are in a stone?', 14, 'pounds', 'People in Britain still often give their weight in stone.', 3],
  ['How many hours are in a year (not a leap year)?', 8760, 'hours', 'That’s 365 × 24.', 3],
  ['How many minutes are in a week?', 10080, 'minutes', 'That’s 7 × 24 × 60.', 3],
  ['How many years are in a millennium?', 1000, 'years', 'The word comes from the Latin “mille”, meaning thousand.', 1],
  ['How many days are in the month of February in a non-leap year?', 28, 'days', 'It’s the only month that can pass without a full moon.', 1],

  // ----- words, music & stories -----
  ['How many letters are in the English alphabet?', 26, 'letters', 'The most common letter in English is E.', 1],
  ['How many letters are in the Greek alphabet?', 24, 'letters', 'The word “alphabet” comes from its first two letters, alpha and beta.', 2],
  ['How many lines are in a sonnet?', 14, 'lines', 'Shakespeare wrote over 150 of them.', 2],
  ['How many sonnets did Shakespeare write?', 154, 'sonnets', 'They were first published together in 1609.', 3],
  ['How many syllables are in a traditional haiku?', 17, 'syllables', 'Arranged as 5, 7 and 5.', 2],
  ['How many keys are on a standard piano?', 88, 'keys', 'Early pianos had far fewer keys.', 2],
  ['How many black keys are on a standard piano?', 36, 'keys', 'The white keys number 52.', 3],
  ['How many strings does a standard guitar have?', 6, 'strings', 'Twelve-string guitars double each one up.', 1],
  ['How many strings does a violin have?', 4, 'strings', 'The strings were traditionally made from sheep gut.', 1],
  ['How many strings does a concert pedal harp usually have?', 47, 'strings', 'The red strings are all Cs, to help harpists find their place.', 3],
  ['How many symphonies did Beethoven complete?', 9, 'symphonies', 'He was almost completely deaf when he wrote the Ninth.', 2],
  ['How old was Mozart when he died?', 35, 'years old', 'He wrote over 600 works in that short life.', 3],
  ['How many wives did King Henry VIII have?', 6, 'wives', 'Divorced, beheaded, died; divorced, beheaded, survived.', 1],
  ['How many years did the Hundred Years’ War actually last?', 116, 'years', 'It ran from 1337 to 1453, with long breaks.', 3],
  ['How many years did the Berlin Wall stand?', 28, 'years', 'From 1961 to 1989.', 2],
  ['How old was Queen Elizabeth II when she died?', 96, 'years old', 'She reigned for 70 years — the longest of any British monarch.', 2],
  ['How many main books are in the Harry Potter series?', 7, 'books', 'One for each year at the wizarding school.', 1],
  ['How many dwarfs are in the fairy tale of Snow White?', 7, 'dwarfs', 'The Brothers Grimm first wrote the tale down in 1812.', 1],
  ['How many spirits visit Scrooge in “A Christmas Carol”, not counting Marley?', 3, 'spirits', 'Past, Present and Yet to Come.', 1],
  ['How many Pokémon were in the original Pokédex?', 151, 'creatures', 'The last one, Mew, was a secret hidden in the game.', 2],
  ['How many seasons did the sitcom “Friends” run for?', 10, 'seasons', 'It ran from 1994 to 2004.', 2],
  ['How many seasons did the sitcom “Seinfeld” run for?', 9, 'seasons', 'It was famously a “show about nothing”.', 3],
  ['How many ghosts chase you in the original Pac-Man?', 4, 'ghosts', 'Blinky, Pinky, Inky and Clyde.', 1],
  ['How many houses are there at Hogwarts?', 4, 'houses', 'A talking hat decides which one you join.', 1],
  ['How many Infinity Stones are there in the Marvel films?', 6, 'stones', 'Space, Mind, Reality, Power, Time and Soul.', 2],
  ['How many rings of power were given to the race of Men in “The Lord of the Rings”?', 9, 'rings', 'Seven went to the Dwarves and three to the Elves.', 3],
  ['How many books are in “The Chronicles of Narnia” series?', 7, 'books', 'The first one published was “The Lion, the Witch and the Wardrobe”.', 2],
];

export const question = (i) => {
  const [q, a, unit, fact, d, kind] = BANK[i];
  return { q, a, unit, fact, d, year: kind === Y };
};

// ---------- constants ----------
export const START_CHIPS = 5;
export const BONUS = 3; // closest guess without going over
export const BULLSEYE = 5; // exactly right
export const LINE_MS = 2500; // the guesses slide onto the line before betting opens
export const BET_MS = 20000;
export const REVEAL_MS = 8500;
export const GRACE_MS = 1500; // clients auto-submit at 0; the host waits a moment longer
export const MAX_GUESS = 999999999999;
export const HIGH_ODDS = 6;

// ---------- setup ----------
export function newGame(players, opts = {}) {
  const n = [7, 10, 15].includes(Number(opts.questions)) ? Number(opts.questions) : 10;
  const timer = [30, 45, 60].includes(Number(opts.timer)) ? Number(opts.timer) : 45;
  return {
    phase: 'deal',
    players: players.map((p) => ({ pid: p.pid, name: p.name, chips: START_CHIPS })),
    total: n,
    timer,
    qs: [],
    qn: 0,
    seed: 0,
    at: 0,
    deadline: 0,
    guesses: players.map(() => null),
    slots: [],
    bets: players.map(() => null),
    last: null,
    autoAt: 0,
    winners: null,
  };
}

// Pick the questions (no repeats) with a partial Fisher–Yates shuffle, plus a seed for the bots.
export function dealRanges(s) {
  const r = [];
  for (let k = 0; k < s.total; k++) r.push(BANK.length - k);
  r.push(1 << 30);
  return r;
}

// ---------- slots & odds ----------
// slots[0] is "All too high"; slots[1..] are the distinct guesses, low to high.
export function oddsFor(i, k) {
  const d = Math.abs(i - (k - 1) / 2);
  return Math.min(5, 2 + Math.floor(d));
}

export function makeSlots(guesses) {
  const vals = [...new Set(guesses.filter((g) => g != null))].sort((a, b) => a - b);
  const slots = [{ v: null, who: [], odds: HIGH_ODDS }];
  vals.forEach((v, i) => {
    slots.push({ v, who: guesses.map((g, seat) => (g === v ? seat : -1)).filter((x) => x >= 0), odds: oddsFor(i, vals.length) });
  });
  return slots;
}

/** Index of the winning slot: the highest guess not over the answer, else "All too high" (0). */
export function winningSlot(slots, answer) {
  let w = 0;
  for (let i = 1; i < slots.length; i++) if (slots[i].v <= answer) w = i;
  return w;
}

/** What one bet returns: a win pays odds × (1 free chip + the chips you added) and you keep your stake. */
export function betDelta(bet, slots, win) {
  return bet.slot === win ? slots[win].odds * (1 + bet.extra) : -bet.extra;
}

// ---------- phases ----------
function startQuestion(s, now) {
  s.phase = 'guess';
  s.at = now;
  s.deadline = now + s.timer * 1000;
  s.guesses = s.players.map(() => null);
  s.slots = [];
  s.bets = s.players.map(() => null);
  s.last = null;
}

function startBetting(s, now) {
  s.slots = makeSlots(s.guesses);
  if (s.slots.length === 1) return reveal(s, now); // nobody guessed: nothing to bet on
  s.phase = 'bet';
  s.at = now;
  s.deadline = now + LINE_MS + BET_MS;
}

function reveal(s, now) {
  const q = question(s.qs[s.qn]);
  const win = winningSlot(s.slots, q.a);
  const before = s.players.map((p) => p.chips);
  const delta = s.players.map(() => 0);
  const betWin = s.players.map(() => 0);
  const bonus = s.players.map(() => 0);
  s.players.forEach((p, i) => {
    for (const b of s.bets[i] || []) {
      const d = betDelta(b, s.slots, win);
      delta[i] += d;
      if (d > 0) betWin[i] += d;
    }
  });
  if (win > 0) {
    for (const i of s.slots[win].who) bonus[i] = s.slots[win].v === q.a ? BULLSEYE : BONUS;
  }
  s.players.forEach((p, i) => {
    delta[i] += bonus[i];
    p.chips = Math.max(0, p.chips + delta[i]);
  });
  s.phase = 'reveal';
  s.at = now;
  s.last = { answer: q.a, win, before, delta, bonus, betWin };
  s.autoAt = now + REVEAL_MS;
}

function finish(s) {
  s.phase = 'over';
  const best = Math.max(...s.players.map((p) => p.chips));
  s.winners = s.players.map((p, i) => (p.chips === best ? i : -1)).filter((i) => i >= 0);
}

// ---------- actions ----------
export function applyAction(s0, a, seat, ctx = {}) {
  const s = structuredClone(s0);
  const now = ctx.now ?? 0;
  if (!a || typeof a !== 'object') throw new Error('bad action');
  switch (a.type) {
    case 'deal': {
      if (seat !== -1) throw new Error('system only');
      if (s.phase !== 'deal') throw new Error('already dealt');
      const r = ctx.rand;
      if (!Array.isArray(r) || r.length !== s.total + 1) throw new Error('need randomness');
      const idx = BANK.map((_, i) => i);
      for (let k = 0; k < s.total; k++) {
        const j = k + (r[k] % (BANK.length - k));
        [idx[k], idx[j]] = [idx[j], idx[k]];
      }
      s.qs = idx.slice(0, s.total);
      s.seed = r[s.total] >>> 0;
      s.qn = 0;
      startQuestion(s, now);
      return s;
    }
    case 'guess': {
      if (seat < 0 || seat >= s.players.length) throw new Error('players only');
      if (s.phase !== 'guess') throw new Error('not guessing now');
      if (a.q !== undefined && a.q !== s.qn) throw new Error('old question');
      if (s.guesses[seat] != null) throw new Error('already guessed');
      const v = a.value;
      if (!Number.isInteger(v) || v < 0 || v > MAX_GUESS) throw new Error('guess must be a whole number');
      s.guesses[seat] = v;
      if (s.guesses.every((g) => g != null)) startBetting(s, now);
      return s;
    }
    case 'bet': {
      if (seat < 0 || seat >= s.players.length) throw new Error('players only');
      if (s.phase !== 'bet') throw new Error('not betting now');
      if (a.q !== undefined && a.q !== s.qn) throw new Error('old question');
      if (s.bets[seat] != null) throw new Error('already bet');
      const bets = a.bets;
      if (!Array.isArray(bets) || bets.length > 2) throw new Error('up to two bets');
      let spent = 0;
      const clean = bets.map((b) => {
        if (!b || !Number.isInteger(b.slot) || b.slot < 0 || b.slot >= s.slots.length) throw new Error('bad slot');
        const extra = b.extra ?? 0;
        if (!Number.isInteger(extra) || extra < 0) throw new Error('bad stake');
        spent += extra;
        return { slot: b.slot, extra };
      });
      if (spent > s.players[seat].chips) throw new Error('not enough chips');
      s.bets[seat] = clean;
      if (s.bets.every((b) => b != null)) reveal(s, now);
      return s;
    }
    case 'timeout': {
      if (seat !== -1) throw new Error('system only');
      if (a.q !== s.qn || a.phase !== s.phase) throw new Error('stale timeout');
      if (s.phase === 'guess') startBetting(s, now);
      else if (s.phase === 'bet') {
        s.bets = s.bets.map((b) => b || []);
        reveal(s, now);
      } else throw new Error('nothing to time out');
      return s;
    }
    case 'next': {
      if (seat !== -1) throw new Error('system only');
      if (s.phase !== 'reveal') throw new Error('not revealing');
      if (s.qn + 1 >= s.total) finish(s);
      else { s.qn++; startQuestion(s, now); }
      return s;
    }
    default:
      throw new Error('unknown action');
  }
}

export function tick(s, now) {
  if (s.phase === 'deal') return { type: 'deal' };
  if ((s.phase === 'guess' || s.phase === 'bet') && now >= s.deadline + GRACE_MS) return { type: 'timeout', q: s.qn, phase: s.phase };
  if (s.phase === 'reveal' && now >= s.autoAt) return { type: 'next' };
  return null;
}

// ---------- bot ----------
// Deterministic per (game seed, question, seat, salt) so a bot "remembers" its estimate.
function hash32(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    h ^= x >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}
const unit = (...xs) => (hash32(...xs) + 0.5) / 4294967296;
function normal(...xs) {
  const u = unit(...xs, 1);
  const v = unit(...xs, 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const SIGMA = [0, 0.15, 0.32, 0.55]; // relative spread for amounts
const YEAR_SD = [0, 6, 20, 55]; // years

/** The bot's private estimate for the current question (noisy, never peeks perfectly). */
export function botEstimate(s, seat) {
  const q = question(s.qs[s.qn]);
  const z = Math.max(-2.5, Math.min(2.5, normal(s.seed, s.qn, seat)));
  let e;
  if (q.year) e = q.a + z * YEAR_SD[q.d];
  else {
    e = q.a * Math.exp(z * SIGMA[q.d]);
    // tiny counts round to the answer too easily: nudge sometimes
    if (q.a <= 12 && Math.abs(z) > 0.9) e += Math.sign(z) * Math.max(1, Math.round(Math.abs(z) * q.d * 0.6));
  }
  return Math.max(0, Math.min(MAX_GUESS, Math.round(e)));
}

export function botThinkMs(s, seat) {
  return 1500 + Math.floor(unit(s.seed, s.qn, seat, s.phase === 'bet' ? 7 : 3) * (s.phase === 'bet' ? 3500 : 6000));
}

export function botGuess(s, seat) {
  return { type: 'guess', q: s.qn, value: botEstimate(s, seat) };
}

export function botBet(s, seat) {
  const q = question(s.qs[s.qn]);
  const own = botEstimate(s, seat);
  // blend its own hunch with the table's median ("wisdom of the crowd")
  const vals = s.guesses.filter((g) => g != null).sort((a, b) => a - b);
  const med = vals.length ? vals[Math.floor((vals.length - 1) / 2)] : own;
  const belief = q.year ? Math.round((2 * own + med) / 3) : Math.round(Math.exp((2 * Math.log(own + 1) + Math.log(med + 1)) / 3) - 1);
  const main = winningSlot(s.slots, belief);
  // hedge: the next lower slot (a bit safer), or "All too high" when it's the lowest guess
  let hedge = main > 1 ? main - 1 : main === 1 ? 0 : 1;
  if (hedge >= s.slots.length) hedge = main;
  const chips = s.players[seat].chips;
  const share = [0, 0.3, 0.15, 0.05][q.d];
  const extra = Math.min(chips, Math.floor(chips * share));
  return { type: 'bet', q: s.qn, bets: [{ slot: main, extra }, { slot: hedge, extra: 0 }] };
}
