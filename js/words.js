// Words for Draw: everyday things that are fun to sketch.
export const WORDS = `apple, banana, cherry, grapes, lemon, pear, pineapple, strawberry, watermelon, carrot,
broccoli, corn, mushroom, pumpkin, potato, pizza, burger, hot dog, sandwich, taco, donut, cookie, cake,
cupcake, ice cream, popcorn, pretzel, cheese, egg, bread, sushi, spaghetti, pancake, waffle, coffee,
teapot, cup, fork, spoon, bowl, chair, table, bed, couch, lamp, clock, door, window, key, lock, ladder,
bucket, broom, umbrella, glasses, hat, crown, shoe, sock, boot, shirt, dress, scarf, glove, backpack,
suitcase, wallet, ring, necklace, watch, phone, laptop, camera, television, radio, guitar, piano, drum,
trumpet, violin, microphone, headphones, robot, rocket, airplane, helicopter, car, bus, truck, bicycle,
motorcycle, train, sailboat, submarine, tractor, skateboard, scooter, anchor, bridge, castle, house,
tent, igloo, lighthouse, windmill, pyramid, fountain, mountain, volcano, island, beach, desert, forest,
river, waterfall, rainbow, cloud, lightning, snowflake, snowman, sun, moon, star, planet, tornado,
campfire, candle, balloon, kite, gift, trophy, medal, flag, map, compass, magnet, battery, light bulb,
scissors, pencil, crayon, paintbrush, book, envelope, calendar, dice, puzzle, yo-yo, whistle, bell,
hammer, saw, shovel, axe, wrench, toothbrush, comb, mirror, soap, bathtub, toilet, dog, cat, mouse,
rabbit, horse, cow, pig, sheep, goat, chicken, duck, owl, penguin, parrot, eagle, flamingo, peacock,
swan, frog, turtle, snake, lizard, crocodile, dinosaur, dragon, unicorn, fish, shark, whale, dolphin,
octopus, crab, lobster, jellyfish, starfish, snail, butterfly, bee, ladybug, spider, ant, worm, bat,
bear, panda, koala, lion, tiger, zebra, giraffe, elephant, monkey, kangaroo, camel, hippo, rhino, fox,
wolf, deer, squirrel, hedgehog, flower, rose, sunflower, tulip, tree, palm tree, cactus, leaf, acorn,
nest, feather, bone, skull, ghost, witch, wizard, pirate, ninja, astronaut, mermaid, angel, vampire,
alien, king, queen, knight, clown, chef, doctor, farmer, firefighter, teacher, baby, superhero, sword,
shield, bow and arrow, cannon, treasure chest, crystal ball, magic wand, hourglass, spiderweb,
skeleton, scarecrow, jack-o-lantern, christmas tree, stocking, snowball, sled, ice skate, swing,
slide, seesaw, sandcastle, surfboard, basketball, football, soccer ball, baseball, tennis racket,
golf, hockey stick, dartboard, fishing rod, hot air balloon, parachute, ferris wheel, roller coaster,
carousel, lollipop, candy cane, gingerbread man, birthday cake, party hat, fireworks, flying saucer,
toaster, refrigerator, washing machine, vacuum, fan, sunglasses, bandage, pill, syringe, tooth,
eye, ear, nose, hand, foot, heart, brain, muscle, beard, mustache, ponytail, crown, zipper, button`
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean)
  .filter((w, i, a) => a.indexOf(w) === i);
