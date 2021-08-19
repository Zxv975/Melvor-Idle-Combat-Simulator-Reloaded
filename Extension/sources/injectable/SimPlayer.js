/*  Melvor Idle Combat Simulator

    Copyright (C) <2020>  <Coolrox95>
    Modified Copyright (C) <2020> <Visua0>
    Modified Copyright (C) <2020, 2021> <G. Miclotte>

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

(() => {

    const reqs = [
        'SimManager'
    ];

    const setup = () => {

        const MICSR = window.MICSR;

        /**
         * SimPlayer class, allows creation of a functional Player object without affecting the game
         */
        MICSR.SimPlayer = class extends Player {
            constructor(simManager) {
                super(simManager);
                this.detachGlobals();
                this.replaceGlobals();
                this.foodLimit = 1e15;
            }

            // detach globals attached by parent constructor
            detachGlobals() {
                this.splashManager = {
                    add: () => {
                    },
                };
                this.effectRenderer = {
                    queueRemoveAll: () => {
                    },
                    removeEffects: () => {
                    },
                    addStun: () => {
                    },
                    addSleep: () => {
                    },
                    addCurse: () => {
                    },
                    addDOT: () => {
                    },
                    addReflexive: () => {
                    },
                    addStacking: () => {
                    },
                    addModifier: () => {
                    },
                };
                this.statElements = undefined;
                this.attackBar = undefined;
                this.summonBar = undefined;
            }

            setCallbacks() {
            }

            // replace globals with properties
            replaceGlobals() {
                // skillLevel
                this.skillLevel = skillLevel.map(_ => 1);
                this.skillLevel[CONSTANTS.skill.Hitpoints] = 10;
                // TODO: currentGamemode, numberMultiplier
                // gp, skillXP, PETS, slayercoins
                this.resetGains();
                // petUnlocked
                this.petUnlocked = petUnlocked.map(x => false);
                // chosenAgilityObstacles, agility MASTERY, agilityPassivePillarActive
                this.course = Array(10).fill(-1);
                this.courseMastery = Array(10).fill(false);
                this.pillar = -1;
                // herbloreBonuses
                this.potionSelected = false;
                this.potionTier = 0;
                this.potionID = -1;
                // isSynergyUnlocked
                this.summoningSynergy = true;
                // shopItemsPurchased
                this.autoEatTier = -1;
                // cooking MASTERY
                this.cookingPool = false;
                this.cookingMastery = false;
            }

            resetGains() {
                this.gp = 0;
                this.skillXP = skillLevel.map(_ => 0);
                this.petRolls = {};
                this._slayercoins = 0;
                this.usedAmmo = 0;
                this.usedPotionCharges = 0;
                this.usedPrayerPoints = 0;
                this.food.currentSlot.quantity = this.foodLimit;
            }

            getGainsPerSecond(ticks) {
                const seconds = ticks / 20;
                return {
                    gp: this.gp / seconds,
                    skillXP: this.skillXP.map(x => x / seconds),
                    petRolls: this.petRolls,
                    slayercoins: this.slayercoins / seconds,
                    usedAmmo: this.usedAmmo / seconds,
                    usedFood: (this.foodLimit - this.food.currentSlot.quantity) / seconds,
                    usedPotionCharges: this.usedPotionCharges / seconds,
                    usedPrayerPoints: this.usedPrayerPoints / seconds,
                }
            }

            addSlayerCoins(amount) {
                amount = applyModifier(amount, this.modifiers.increasedSlayerCoins - this.modifiers.decreasedSlayerCoins, 0);
                this._slayercoins += amount;
            }

            addGP(amount) {
                this.gp += amount;
            }

            addXP(skill, amount) {
                this.skillXP[skill] += this.getSkillXPToAdd(skill, amount);
            }

            addPetModifiers() {
                PETS.forEach((pet, i) => {
                    if (this.petUnlocked[i] && !pet.activeInRaid && pet.modifiers !== undefined) {
                        this.modifiers.addModifiers(pet.modifiers);
                    }
                });
            }

            addConditionalModifiers() {
                [
                    this.bankConditionWatchLists,
                    this.gloveConditionWatchLists,
                ].forEach(watchLists => {
                    watchLists.forEach(conditions => {
                        conditions.forEach((condition) => {
                            // for the combat simulator we always assume the bank and glove conditions are true
                            // instead of skipping the entire conditional, we set condition.active to true in case this is used elsewhere
                            condition.active = true;
                            if (condition.active)
                                this.modifiers.addModifiers(condition.modifiers);
                        });
                    });
                });
            }

            addAgilityModifiers() {
                MICSR.addAgilityModifiers(this.course, this.courseMastery, this.pillar, this.modifiers);
            }

            addShopModifiers() {
                // auto eat modifiers
                for (let tier = 0; tier <= this.autoEatTier; tier++) {
                    this.modifiers.addModifiers(SHOP.General[1 + tier].contains.modifiers);
                }

                // other shop modifiers are not relevant for combat sim at this point
            }

            addSummonSynergyModifiers() {
                if (!this.summoningSynergy) {
                    return;
                }
                const summons = [
                    this.getEquipedItem('Summon1').summoningID,
                    this.getEquipedItem('Summon2').summoningID,
                ];
                const synergies = SUMMONING.Synergies[Math.min(...summons)];
                if (!synergies) {
                    return;
                }
                const synergy = synergies[Math.max(...summons)];
                if (!synergy) {
                    return;
                }
                // add the synergy modifiers
                this.modifiers.addModifiers(synergy.modifiers);
            }

            getCurrentSynergy() {
                if (!this.summoningSynergy) {
                    return undefined;
                }
                const summLeft = this.equipmentID(MICSR.equipmentSlot.Summon1);
                const summRight = this.equipmentID(MICSR.equipmentSlot.Summon2);
                if (summLeft > 0 && summRight > 0 && summLeft !== summRight) {
                    const min = Math.min(items[summLeft].summoningID, items[summRight].summoningID);
                    const max = Math.max(items[summLeft].summoningID, items[summRight].summoningID);
                    return SUMMONING.Synergies[min][max];
                }
                return undefined;
            }

            getEquipedItem(slotName) {
                return MICSR.getItem(this.equipmentID(MICSR.equipmentSlot[slotName]), slotName);
            }

            equipmentID(slotID) {
                return this.equipment.slotArray[slotID].item.id;
            }

            equipmentIDs() {
                return this.equipment.slotArray.map(x => x.item.id);
            }

            equipmentOccupiedBy(slotID) {
                return this.equipment.slotArray[slotID].occupiedBy;
            }

            getSkillXPToAdd(skill, xp) {
                let xpMultiplier = 1;
                xpMultiplier += this.modifiers.getSkillModifierValue("increasedSkillXP", skill) / 100;
                xpMultiplier -= this.modifiers.getSkillModifierValue("decreasedSkillXP", skill) / 100;
                xpMultiplier += (this.modifiers.increasedGlobalSkillXP - this.modifiers.decreasedGlobalSkillXP) / 100;
                return xp * xpMultiplier;
            }

            rewardXPAndPetsForDamage(damage) {
                damage = damage / numberMultiplier;
                const attackInterval = this.timers.act.maxTicks * TICK_INTERVAL;
                // Combat Style
                this.attackStyle.experienceGain.forEach((gain) => {
                    this.addXP(gain.skill, gain.ratio * damage);
                });
                // Hitpoints
                this.addXP(CONSTANTS.skill.Hitpoints, damage * 1.33);
                // Prayer
                let prayerRatio = 0;
                this.activePrayers.forEach((pID) => {
                    return (prayerRatio += PRAYER[pID].pointsPerPlayer);
                });
                if (prayerRatio > 0) {
                    this.addXP(CONSTANTS.skill.Prayer, prayerRatio * damage);
                }
                // pets
                this.petRolls[attackInterval] = 1 + (this.petRolls[attackInterval] | 0);
            }

            // get skill level from property instead of global `skillLevel`
            getSkillLevel(skillID) {
                return Math.min(99, this.skillLevel[skillID]);
            }

            // don't render anything
            setRenderAll() {
            }

            render() {
            }

            getPotion() {
                return items[herbloreItemData[this.potionID].itemID[this.potionTier]];
            }

            // track potion usage instead of consuming
            consumePotionCharge(type) {
                if (this.potionSelected) {
                    const item = this.getPotion();
                    if (type === herbloreItemData[item.masteryID[1]].consumesOn
                        && !rollPercentage(this.modifiers.increasedChanceToPreservePotionCharge - this.modifiers.decreasedChanceToPreservePotionCharge)
                    ) {
                        this.usedPotionCharges++;
                    }
                }
            }

            reusePotion() {
            }

            addPotionModifiers() {
                if (this.potionSelected) {
                    const item = this.getPotion();
                    if (item.modifiers !== undefined) {
                        this.modifiers.addModifiers(item.modifiers);
                    }
                }
            }

            // track prayer point usage instead of consuming
            consumePrayerPoints(amount) {
                if (amount > 0) {
                    amount = this.applyModifiersToPrayerCost(amount);
                    this.consumePotionCharge("PrayerPointCost");
                    this.usedPrayerPoints += amount;
                }
            }

            // track ammo usage instead of consuming
            consumeAmmo() {
                if (!rollPercentage(this.modifiers.ammoPreservationChance)) {
                    this.usedAmmo++;
                }
            }

            // TODO: override
            updateForEquipmentChange() {
            }

            equipItem(itemID, set, slot = "Default", quantity = 1) {
                const equipment = this.equipmentSets[set];
                const itemToEquip = itemID === -1 ? emptyItem : items[itemID];
                if (slot === "Default") {
                    slot = itemToEquip.validSlots[0];
                }
                // clear other slots occupied by current slot
                equipment.slotArray.forEach(x => {
                    if (x.occupiedBy === slot) {
                        x.occupiedBy = "None";
                    }
                });
                equipment.equipItem(itemToEquip, slot, quantity);
            }

            unequipItem(set, slot) {
                const equipment = this.equipmentSets[set];
                equipment.unequipItem(slot);
            }

            equipFood(itemID, quantity = this.foodLimit) {
                if (itemID === -1) {
                    this.unequipFood();
                    return;
                }
                // Unequip previous food
                this.food.unequipSelected();
                // Proceed to equip the food
                this.food.equip(items[itemID], quantity);
            }

            unequipFood() {
                this.food.unequipSelected();
            }

            getFoodHealingBonus(item) {
                let bonus = this.modifiers.increasedFoodHealingValue - this.modifiers.decreasedFoodHealingValue;
                const sID = CONSTANTS.skill.Cooking;
                if (item.masteryID !== undefined && item.masteryID[0] === sID && this.cookingMastery) {
                    bonus += 20;
                }
                if (this.cookingPool) {
                    bonus += 10;
                }
                return bonus;
            }
        }
    }

    let loadCounter = 0;
    const waitLoadOrder = (reqs, setup, id) => {
        if (characterSelected && !characterLoading) {
            loadCounter++;
        }
        if (loadCounter > 100) {
            console.log('Failed to load ' + id);
            return;
        }
        // check requirements
        let reqMet = characterSelected && !characterLoading;
        if (window.MICSR === undefined) {
            reqMet = false;
            console.log(id + ' is waiting for the MICSR object');
        } else {
            for (const req of reqs) {
                if (window.MICSR.loadedFiles[req]) {
                    continue;
                }
                reqMet = false;
                // not defined yet: try again later
                if (loadCounter === 1) {
                    window.MICSR.log(id + ' is waiting for ' + req);
                }
            }
        }
        if (!reqMet) {
            setTimeout(() => waitLoadOrder(reqs, setup, id), 50);
            return;
        }
        // requirements met
        window.MICSR.log('setting up ' + id);
        setup();
        // mark as loaded
        window.MICSR.loadedFiles[id] = true;
    }
    waitLoadOrder(reqs, setup, 'SimPlayer');

})();