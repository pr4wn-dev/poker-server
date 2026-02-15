const DIFFICULTY = { HARD: 'hard' };
const PLAY_STYLE = { AGGRESSIVE: 'aggressive' };

class Boss {
    constructor(data) {
        Object.assign(this, data);
    }
}

const test = new Boss({
    id: 'boss_cipher',
    name: 'Rosie "The Viper"',
    areaId: 'area_highrise',
    avatar: 'boss_rosie',
    description: 'Cold and ruthless. Never shows emotion. Strikes without warning.',
    difficulty: DIFFICULTY.HARD,
    playStyle: PLAY_STYLE.AGGRESSIVE,
    minLevel: 7,
    entryFee: 5000,
    chips: 15000,
    skillLevel: 0.65,
    xpReward: 500,
    coinReward: 750,
    chipReward: 5000,
    dropTable: [
        { itemTemplateId: 'CARD_BACK_GOLDEN', weight: 3 },
        { itemTemplateId: 'AVATAR_SHARK', weight: 10 },
        { itemTemplateId: 'XP_BOOST_LARGE', weight: 5 },
        { itemTemplateId: 'UNDERGROUND_PASS', weight: 2 },
        { itemTemplateId: 'YACHT_INVITATION', weight: 0.2, minDefeats: 200 }
    ],
    taunts: [
        "Sssay goodbye to your chips.",
        "I strike without warning.",
        "Your fear is delicious."
    ],
    winQuotes: ["Another victim."],
    loseQuotes: ["You got lucky... this time."]
});

console.log('Boss definition is valid!', test.name);
