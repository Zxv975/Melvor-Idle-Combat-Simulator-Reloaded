/*  Melvor Idle Combat Simulator

    Copyright (C) <2022, 2023> <Broderick Hyman>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

class SimGame extends Game {
    micsr: MICSR;
    // @ts-expect-error Force SimManager type
    combat: SimManager;
    isWebWorker: boolean;
    autoEatTiers: string[];
    telemetry: any;

    // @ts-expect-error Force shop type
    shop: {
        computeProvidedStats: (updatePlayers: boolean) => void;
        isUpgradePurchased(upgrade: ShopPurchase): boolean;
        postDataRegistration(): void;
        purchases: NamespaceRegistry<ShopPurchase>;
        upgradesPurchased: Map<ShopPurchase, number>;
        encode(writer: SaveWriter): SaveWriter;
        decode(reader: SaveWriter, version: number): void;
    };

    constructor(micsr: MICSR, isWebWorker: boolean) {
        super();
        this.micsr = micsr;
        this.isWebWorker = isWebWorker;

        this.autoEatTiers = [
            "melvorD:Auto_Eat_Tier_I",
            "melvorD:Auto_Eat_Tier_II",
            "melvorD:Auto_Eat_Tier_III",
        ];

        // this.loopInterval = -1;
        // this.loopStarted = false;
        this.disableClearOffline = false;
        // this.isUnpausing = false;
        // this.previousTickTime = performance.now();
        // this.enableRendering = true;
        // this.maxOfflineTicks = 20 * 60 * 60 * 24;
        this.registeredNamespaces = new NamespaceMap();
        // @ts-expect-error
        this.dummyNamespaces = new NamespaceMap();
        // this.tickTimestamp = Date.now();
        // this.saveTimestamp = 0;
        // this._isPaused = false;
        this.merchantsPermitRead = false;
        this.characterName = getLangString("CHARACTER_SELECT", "75");
        this.minibar = new Minibar(this as any);
        this.petManager = new PetManager(this as any);
        this.shop = new Shop(this as any) as any;
        this.itemCharges = new ItemCharges(this as any);
        this.tutorial = new Tutorial(this as any);
        this.potions = new PotionManager(this as any);
        this.gp = new GP(this as any);
        this.slayerCoins = new SlayerCoins(this as any);
        this.raidCoins = new RaidCoins(this as any);
        this.readNewsIDs = [];
        this.lastLoadedGameVersion = gameVersion;
        this.completion = new Completion(this as any);
        this.lore = new Lore(this as any);
        this.eventManager = new EventManager();
        // @ts-expect-error
        this.notifications = new NotificationsManager();
        // @ts-expect-error
        this.telemetry = new Telemetry();
        // @ts-expect-error
        this.dropWeightCache = new Map();
        this.refundedAstrology = false;
        // this.refundedAstrologyAgain = false;
        this.renderQueue = {
            title: false,
            combatMinibar: false,
            activeSkills: false,
        };
        this.attackStyles = new NamespaceRegistry(this.registeredNamespaces);
        this.stackingEffects = new NamespaceRegistry(this.registeredNamespaces);
        this.specialAttacks = new NamespaceRegistry(this.registeredNamespaces);
        this.items = new ItemRegistry(this.registeredNamespaces);
        this.pages = new NamespaceRegistry(this.registeredNamespaces);
        this.actions = new NamespaceRegistry(this.registeredNamespaces);
        this.activeActions = new NamespaceRegistry(this.registeredNamespaces);
        this.passiveActions = new NamespaceRegistry(this.registeredNamespaces);
        // @ts-expect-error
        this._passiveTickers = [];
        // @ts-expect-error
        this.actionPageMap = new Map();
        // @ts-expect-error
        this.skillPageMap = new Map();
        this.skills = new NamespaceRegistry(this.registeredNamespaces);
        this.masterySkills = new NamespaceRegistry(this.registeredNamespaces);
        this.monsters = new NamespaceRegistry(this.registeredNamespaces);
        this.monsterAreas = new Map();
        this.combatPassives = new NamespaceRegistry(this.registeredNamespaces);
        this.combatAreas = new NamespaceRegistry(this.registeredNamespaces);
        this.combatAreaDisplayOrder = new NamespacedArray(this.combatAreas);
        this.slayerAreas = new NamespaceRegistry(this.registeredNamespaces);
        this.slayerAreaDisplayOrder = new NamespacedArray(this.slayerAreas);
        this.dungeons = new NamespaceRegistry(this.registeredNamespaces);
        this.dungeonDisplayOrder = new NamespacedArray(this.dungeons);
        this.combatEvents = new NamespaceRegistry(this.registeredNamespaces);
        this.prayers = new NamespaceRegistry(this.registeredNamespaces);
        this.standardSpells = new NamespaceRegistry(this.registeredNamespaces);
        this.curseSpells = new NamespaceRegistry(this.registeredNamespaces);
        this.auroraSpells = new NamespaceRegistry(this.registeredNamespaces);
        this.ancientSpells = new NamespaceRegistry(this.registeredNamespaces);
        this.archaicSpells = new NamespaceRegistry(this.registeredNamespaces);
        this.pets = new NamespaceRegistry(this.registeredNamespaces);
        this.gamemodes = new NamespaceRegistry(this.registeredNamespaces);
        // @ts-expect-error
        this.steamAchievements = new Map();
        this.itemSynergies = new Map();
        this.randomGemTable = new DropTable(this as any, []);
        this.randomSuperiorGemTable = new DropTable(this as any, []);
        // @ts-expect-error
        this.softDataRegQueue = [];
        this.bank = new Bank(this as any, 12, 12);
        this.registeredNamespaces.registerNamespace(
            "melvorBaseGame",
            "Base Game",
            false
        );
        this.registeredNamespaces.registerNamespace(
            "melvorTrue",
            "True",
            false
        );
        const demoNamespace = this.registeredNamespaces.registerNamespace(
            "melvorD",
            "Demo",
            false
        );
        if (cloudManager.hasFullVersionEntitlement) {
            const fullNamespace = this.registeredNamespaces.registerNamespace(
                "melvorF",
                "Full Version",
                false
            );
            this.combatPassives.registerObject(
                new ControlledAffliction(fullNamespace, this as any)
            );
        }
        if (cloudManager.hasTotHEntitlement)
            this.registeredNamespaces.registerNamespace(
                "melvorTotH",
                "Throne of the Herald",
                false
            );
        this.normalAttack = new SpecialAttack(
            demoNamespace,
            {
                id: "Normal",
                defaultChance: 100,
                damage: [{ damageType: "Normal", amplitude: 100 }],
                prehitEffects: [],
                onhitEffects: [],
                cantMiss: false,
                attackCount: 1,
                attackInterval: -1,
                lifesteal: 0,
                usesRunesPerProc: false,
                usesPrayerPointsPerProc: true,
                usesPotionChargesPerProc: true,
                attackTypes: ["melee", "ranged", "magic"],
                isDragonbreath: false,
                name: "Normal Attack",
                description: "Perform a Normal attack.",
                descriptionGenerator: "Perform a Normal attack.",
            },
            this as any
        );
        this.specialAttacks.registerObject(this.normalAttack);
        this.itemEffectAttack = new ItemEffectAttack(
            demoNamespace,
            this as any
        );
        this.emptyEquipmentItem = new EquipmentItem(
            demoNamespace,
            {
                id: "Empty_Equipment",
                tier: "emptyItem",
                name: "",
                validSlots: [],
                occupiesSlots: [],
                equipRequirements: [],
                equipmentStats: [],
                category: "",
                type: "",
                media: "assets/media/skills/combat/food_empty.svg",
                ignoreCompletion: true,
                obtainFromItemLog: false,
                golbinRaidExclusive: false,
                sellsFor: 0,
            },
            this as any
        );
        this.items.registerObject(this.emptyEquipmentItem);
        this.emptyFoodItem = new FoodItem(demoNamespace, {
            itemType: "Food",
            id: "Empty_Food",
            name: "",
            healsFor: 0,
            category: "",
            type: "",
            media: "assets/media/skills/combat/food_empty.svg",
            ignoreCompletion: true,
            obtainFromItemLog: false,
            golbinRaidExclusive: false,
            sellsFor: 0,
        });
        this.items.registerObject(this.emptyFoodItem);
        this.unknownCombatArea = new CombatArea(
            demoNamespace,
            {
                name: "Unknown Area",
                id: "UnknownArea",
                media: "assets/media/main/question.svg",
                monsterIDs: [],
                difficulty: [0],
                entryRequirements: [],
            },
            this as any
        );
        this.combatAreas.registerObject(this.unknownCombatArea);
        this.decreasedEvasionStackingEffect = new StackingEffect(
            demoNamespace,
            {
                id: "DecreasedEvasion",
                stacksToAdd: 1,
                modifiers: { decreasedGlobalEvasion: 10 },
                maxStacks: 3,
                name: "TODO: Get name",
                media: TODO_REPLACE_MEDIA,
            }
        );
        this.activeActionPage = new Page(
            demoNamespace,
            {
                id: "ActiveSkill",
                customName: "Active Skill",
                media: "assets/media/main/logo_no_text.svg",
                containerID: "",
                headerBgClass: "",
                hasGameGuide: false,
                canBeDefault: true,
            },
            this as any
        );
        this.pages.registerObject(this.activeActionPage);
        const unsetMode = new Gamemode(
            demoNamespace,
            {
                id: "Unset",
                name: "Error: Unset Gamemode",
                media: "assets/media/main/question.svg",
                description: "Error: Unset Gamemode",
                rules: [],
                textClass: "",
                btnClass: "",
                isPermaDeath: false,
                isEvent: false,
                endDate: 0,
                combatTriangle: "Standard",
                hitpointMultiplier: 1,
                hasRegen: true,
                capNonCombatSkillLevels: false,
                startingPage: "melvorD:ActiveSkill",
                startingItems: [],
                allowSkillUnlock: true,
                startingSkills: [],
                skillUnlockCost: [Infinity],
                playerModifiers: {},
                enemyModifiers: {},
                hasTutorial: false,
            },
            this as any
        );
        this.gamemodes.registerObject(unsetMode);
        this.currentGamemode = unsetMode;
        this.settings = new Settings(this as any);
        this.stats = new Statistics(this as any);
        this.combat = new SimManager(this, demoNamespace) as any;
        this.golbinRaid = new RaidManager(this as any, demoNamespace);

        this.actions.registerObject(this.combat);
        this.actions.registerObject(this.golbinRaid);
        this.activeActions.registerObject(this.combat);
        this.activeActions.registerObject(this.golbinRaid);
        this.passiveActions.registerObject(this.combat);
        this.attack = this.registerSkill(demoNamespace, Attack);
        this.strength = this.registerSkill(demoNamespace, Strength);
        this.defence = this.registerSkill(demoNamespace, Defence);
        this.hitpoints = this.registerSkill(demoNamespace, Hitpoints);
        this.ranged = this.registerSkill(demoNamespace, Ranged);
        this.altMagic = this.registerSkill(demoNamespace, AltMagic);
        this.prayer = this.registerSkill(demoNamespace, Prayer);
        this.slayer = this.registerSkill(demoNamespace, Slayer);
        this.woodcutting = this.registerSkill(demoNamespace, Woodcutting);
        this.fishing = this.registerSkill(demoNamespace, Fishing);
        this.firemaking = this.registerSkill(demoNamespace, Firemaking);
        this.cooking = this.registerSkill(demoNamespace, Cooking);
        this.mining = this.registerSkill(demoNamespace, Mining);
        this.smithing = this.registerSkill(demoNamespace, Smithing);
        this.thieving = this.registerSkill(demoNamespace, Thieving);
        this.farming = this.registerSkill(demoNamespace, Farming);
        this.fletching = this.registerSkill(demoNamespace, Fletching);
        this.crafting = this.registerSkill(demoNamespace, Crafting);
        this.runecrafting = this.registerSkill(demoNamespace, Runecrafting);
        this.herblore = this.registerSkill(demoNamespace, Herblore);
        this.agility = this.registerSkill(demoNamespace, Agility);
        this.summoning = this.registerSkill(demoNamespace, Summoning);
        this.astrology = this.registerSkill(demoNamespace, Astrology);
        this.township = this.registerSkill(demoNamespace, Township);
        // Fix SimPlayer object to match replaced Player object
        // TODO: Re-enable this when we manage pets directly
        // this.combat.player.registerStatProvider(this.petManager);
        this.combat.player.registerStatProvider(this.shop as any);
        this.combat.player.registerStatProvider(this.potions);
        // this.golbinRaid.player.registerStatProvider(this.petManager.raidStats);
        // this.golbinRaid.player.registerStatProvider(this.shop.raidStats);
        this.detachGlobals();
    }

    detachGlobals() {
        this.telemetry.ENABLE_TELEMETRY = false;
        this.township.tasks.updateMonsterTasks = () => null;
        this.completion.updatePet = () => null;
        this.completion.updateSkill = (_: AnySkill) => null;
        this.completion.updateSkillMastery = (
            _: SkillWithMastery<MasteryAction, MasterySkillData>
        ) => null;
        this.completion.updateItem = (_: AnyItem) => null;
        this.completion.updateMonster = (_: Monster) => null;
        this.completion.updatePet = (_: Pet) => null;
        this.petManager.unlockPet = () => null;
        this.bank.addItem = () => true;
        this.bank.hasItem = () => true;
        this.bank.getQty = () => 1e6;
        this.bank.removeItemQuantity = (
            item: AnyItem,
            quantity: number,
            _: boolean
        ): void => {
            switch (item.type) {
                case "Potion":
                    this.combat.player.usedPotions += quantity;
                    break;
                case "Rune":
                    if (this.combat.player.usedRunes[item.id] === undefined) {
                        this.combat.player.usedRunes[item.id] = 0;
                    }
                    this.combat.player.usedRunes[item.id] += quantity;
                    break;
            }
        };
        this.bank.checkForItems = (costs: AnyItemQuantity[]): boolean => {
            if (costs.find((x) => x.item.type === "Rune") !== undefined) {
                return this.combat.player.hasRunes;
            }
            return true;
        };
        this.gp.add = (amount) => {
            // Store gp on the SimPlayer
            this.combat.player.gp += amount;
        };
        this.slayerCoins.add = (amount) => {
            // Store sc on the SimPlayer
            this.combat.player.slayercoins += amount;
        };
        this.skills.allObjects.forEach((skill) => {
            // Make sure nothing gets called on skill level ups, it tends to try rendering
            // @ts-expect-error
            skill.levelUp = () => null;
        });
    }

    postDataRegistration() {
        this.combatAreas.forEach((area) => {
            area.monsters.forEach((monster) =>
                this.monsterAreas.set(monster, area)
            );
        });
        this.slayerAreas.forEach((area) => {
            area.monsters.forEach((monster) =>
                this.monsterAreas.set(monster, area)
            );
            const slayerLevelReq = area.entryRequirements.find((req) => {
                return req.type === "SkillLevel" && req.skill === this.slayer;
            }) as SkillLevelRequirement;
            if (slayerLevelReq !== undefined)
                area.slayerLevelRequired = slayerLevelReq.level;
        });
        this.skills
            .filter((s) => !this.micsr.bannedSkills.includes(s.localID))
            .forEach((skill) => skill.postDataRegistration());
        this.shop.postDataRegistration();
        // this.golbinRaid.postDataRegistration();
        this.combat.postDataRegistration();
        // @ts-expect-error
        this._passiveTickers = this.passiveActions.allObjects;
        // this.pages.forEach((page) => {
        //   if (page.action !== undefined) this.actionPageMap.set(page.action, page);
        //   if (page.skills !== undefined) {
        //     page.skills.forEach((skill) => {
        //       const pageArray = this.skillPageMap.get(skill);
        //       if (pageArray !== undefined) {
        //         pageArray.push(page);
        //       } else {
        //         this.skillPageMap.set(skill, [page]);
        //       }
        //     });
        //   }
        // });
        // this.settings.postDataRegistration();
    }

    // Override to prevent saving
    clearActiveAction(save?: boolean): void {
        if (!this.disableClearOffline) {
            firstSkillAction = true;
            this.activeAction = undefined;
        }
    }

    onLoad() {
        // These skill onLoad functions have a lot of UI calls
        // this.skills.forEach((skill) => {
        //     skill.onLoad();
        //   });
        // @ts-expect-error
        this.astrology.computeProvidedStats(false);

        // this.completion.onLoad();
        // this.bank.onLoad();
        // @ts-expect-error
        this.potions.computeProvidedStats(false);
        this.petManager.onLoad();
        this.shop.computeProvidedStats(false);
        this.combat.initialize();
        // this.gp.onLoad();
        // this.slayerCoins.onLoad();
        // this.raidCoins.onLoad();
        // this.settings.initializeToggles();
        // this.settings.initializeChoices();
        // this.township.postStatLoad();
        // this.township.tasks.onLoad();
        // this.settings.onLoad();

        const potion = this.combat.player.potion;
        if (potion && !this.potions.autoReusePotionsForAction(potion.action)) {
            this.potions.toggleAutoReusePotion(potion.action);
        }
    }

    setAutoEatTier(tier: number) {
        this.shop.upgradesPurchased.clear();
        for (let t = 0; t <= tier; t++) {
            this.shop.upgradesPurchased.set(
                this.shop.purchases.getObjectByID(this.autoEatTiers[t])!,
                1
            );
        }
        this.shop.computeProvidedStats(false);
    }

    resetToBlankState() {
        this.combat.player.resetToBlankState();
        this.combat.player.setPotion(undefined);
        this.shop.upgradesPurchased.clear();

        this.astrology.actions.allObjects.forEach((constellation) => {
            constellation.standardModsBought.fill(0);
            constellation.uniqueModsBought.fill(0);
        });
        // @ts-expect-error
        this.astrology.computeProvidedStats(false);

        // @ts-expect-error
        this.potions.computeProvidedStats(false);
        this.shop.computeProvidedStats(false);
        this.combat.player.computeAllStats();
    }

    constructEventMatcher(data: GameEventMatcherData): GameEventMatcher {
        switch (data.type) {
            case "EnemyAttack":
            case "FoodEaten":
            case "MonsterDrop":
            case "MonsterKilled":
            case "PlayerAttack":
            case "PlayerHitpointRegeneration":
            case "PlayerSummonAttack":
            case "PotionChargeUsed":
            case "PotionUsed":
            case "PrayerPointConsumption":
            case "RuneConsumption":
            case "SummonTabletUsed":
                return super.constructEventMatcher(data);
        }
        return new CustomEventMatcher();
    }

    checkRequirements(
        requirements: AnyRequirement[],
        notifyOnFailure?: boolean,
        slayerLevelReq?: number
    ): boolean {
        return requirements.every((req: any) =>
            this.checkRequirement(req, notifyOnFailure)
        );
    }

    checkRequirement(
        requirement: AnyRequirement,
        notifyOnFailure?: boolean,
        slayerLevelReq?: number
    ): boolean {
        switch (requirement.type) {
            case "SkillLevel":
                return (
                    this.combat.player.skillLevel.get(requirement.skill.id)! >=
                    requirement.level
                );
            case "SlayerItem":
                return super.checkRequirement(
                    requirement,
                    false,
                    slayerLevelReq
                );
            case "Completion":
            case "DungeonCompletion":
            case "ShopPurchase":
                return true;
        }
        return false;
    }

    generateSaveStringSimple(): string {
        // @ts-expect-error
        const header = this.getSaveHeader();
        const writer = new SaveWriter("Write", 512);
        this.encodeSimple(writer);
        return writer.getSaveString(header);
    }

    encodeSimple(writer: SaveWriter): SaveWriter {
        // writer.writeFloat64(this.tickTimestamp);
        // writer.writeFloat64(this.saveTimestamp);
        // writer.writeBoolean(this.activeAction !== undefined);
        // if (this.activeAction !== undefined)
        //     writer.writeNamespacedObject(this.activeAction);
        // writer.writeBoolean(this.pausedAction !== undefined);
        // if (this.pausedAction !== undefined)
        //     writer.writeNamespacedObject(this.pausedAction);
        // writer.writeBoolean(this._isPaused);
        writer.writeBoolean(this.merchantsPermitRead);
        writer.writeNamespacedObject(this.currentGamemode);
        // writer.writeString(this.characterName);
        // this.bank.encode(writer);
        this.combat.encode(writer);
        // this.golbinRaid.encode(writer);
        // this.minibar.encode(writer);
        this.petManager.encode(writer);
        this.shop.encode(writer);
        // this.itemCharges.encode(writer);
        this.tutorial.encode(writer);
        this.potions.encode(writer);
        // this.stats.encode(writer);
        // this.settings.encode(writer);
        // this.gp.encode(writer);
        // this.slayerCoins.encode(writer);
        // this.raidCoins.encode(writer);
        // writer.writeArray(this.readNewsIDs, (newsID, writer) => {
        //     writer.writeString(newsID);
        // });
        // writer.writeString(this.lastLoadedGameVersion);
        // nativeManager.encode(writer);

        const goodSkills = this.skills.filter(
            (x) =>
                !this.micsr.bannedSkills
                    .map((bannedSkill: string) => `melvorD:${bannedSkill}`)
                    .includes(x.id)
        );

        writer.writeUint32(goodSkills.length);
        goodSkills.forEach((skill) => {
            writer.writeNamespacedObject(skill);
            writer.startMarkingWriteRegion();
            skill.encode(writer);
            writer.stopMarkingWriteRegion();
        });
        // mod.encode(writer);
        // this.completion.encode(writer);
        return writer;
    }

    decodeSimple(reader: SaveWriter, version: number): void {
        // let resetPaused = false;
        // this.tickTimestamp = reader.getFloat64();
        // this.saveTimestamp = reader.getFloat64();
        // if (reader.getBoolean()) {
        //     const activeAction = reader.getNamespacedObject(this.activeActions);
        //     if (typeof activeAction !== "string")
        //         this.activeAction = activeAction;
        // }
        // if (reader.getBoolean()) {
        //     const pausedAction = reader.getNamespacedObject(this.activeActions);
        //     if (typeof pausedAction === "string") resetPaused = true;
        //     else this.pausedAction = pausedAction;
        // }
        // this._isPaused = reader.getBoolean();
        this.merchantsPermitRead = reader.getBoolean();
        const gamemode = reader.getNamespacedObject(this.gamemodes);
        if (typeof gamemode === "string")
            throw new Error("Error loading save. Gamemode is not registered.");
        this.currentGamemode = gamemode;
        // this.characterName = reader.getString();
        // this.bank.decode(reader, version);
        this.combat.decode(reader, version);
        // this.golbinRaid.decode(reader, version);
        // this.minibar.decode(reader, version);
        this.petManager.decode(reader, version);
        this.shop.decode(reader, version);
        // this.itemCharges.decode(reader, version);
        this.tutorial.decode(reader, version);
        this.potions.decode(reader, version);
        // this.stats.decode(reader, version);
        // this.settings.decode(reader, version);
        // this.gp.decode(reader, version);
        // this.slayerCoins.decode(reader, version);
        // this.raidCoins.decode(reader, version);
        // this.readNewsIDs = reader.getArray((reader) => reader.getString());
        // this.lastLoadedGameVersion = reader.getString();
        // nativeManager.decode(reader, version);
        const numSkills = reader.getUint32();
        for (let i = 0; i < numSkills; i++) {
            const skill = reader.getNamespacedObject(this.skills);
            const skillDataSize = reader.getUint32();
            if (typeof skill === "string")
            reader.getFixedLengthBuffer(skillDataSize);
            else {
                skill.decode(reader, version);
            }
        }
        // mod.decode(reader, version);
        // if (version >= 26) this.completion.decode(reader, version);
        // if (resetPaused) {
        //     if (!this.isGolbinRaid) this._isPaused = false;
        // }
    }

    // Don't render
    render() {}
}

class CustomEventMatcher extends GameEventMatcher {
    doesEventMatch(event: GameEvent): boolean {
        return false;
    }
}
