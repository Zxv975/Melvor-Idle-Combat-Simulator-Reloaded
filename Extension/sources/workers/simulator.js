/*  Melvor Idle Combat Simulator

    Copyright (C) <2020>  <Coolrox95>

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
/// <reference path="../typedefs.js" />

(() => {

    /** @type {CombatSimulator} */
    let combatSimulator;

    onmessage = (event) => {
        switch (event.data.action) {
            case 'RECEIVE_GAMEDATA':
                combatSimulator = new CombatSimulator(event.data);
                break;
            case 'START_SIMULATION':
                const startTime = performance.now();
                combatSimulator.simulateMonster(event.data.monsterStats, event.data.playerStats, event.data.simOptions.trials, event.data.simOptions.maxActions).then((simResult) => {
                    const timeTaken = performance.now() - startTime;
                    postMessage({
                        action: 'FINISHED_SIM',
                        monsterID: event.data.monsterID,
                        simResult: simResult,
                        selfTime: timeTaken
                    });
                });
                break;
            case 'CANCEL_SIMULATION':
                combatSimulator.cancelSimulation();
                break;
        }
    };

    onerror = (error) => {
        postMessage({
            action: 'ERR_SIM',
            error: error,
        });
    }

    // TODO move these globals
    let combatTriangle;
    let protectFromValue;
    let numberMultiplier;
    let enemySpecialAttacks;
    let enemySpawnTimer;
    let hitpointRegenInterval;
    let deadeyeAmulet;
    let confettiCrossbow;
    let warlockAmulet;
    let CURSEIDS;

    class CombatSimulator {
        constructor(data) {
            /**
             * [playerType][enemyType]
             * 0:Melee 1:Ranged 2:Magic
             */
            combatTriangle = {
                normal: {
                    damageModifier: [
                        [1, 1.1, 0.9],
                        [0.9, 1, 1.1],
                        [1.1, 0.9, 1],
                    ],
                    reductionModifier: [
                        [1, 1.25, 0.5],
                        [0.95, 1, 1.25],
                        [1.25, 0.85, 1],
                    ],
                },
                hardcore: {
                    damageModifier: [
                        [1, 1.1, 0.8],
                        [0.8, 1, 1.1],
                        [1.1, 0.8, 1],
                    ],
                    reductionModifier: [
                        [1, 1.25, 0.25],
                        [0.75, 1, 1.25],
                        [1.25, 0.75, 1],
                    ],
                },
            };
            this.cancelStatus = false;
            protectFromValue = data.protectFromValue;
            numberMultiplier = data.numberMultiplier;
            enemySpecialAttacks = data.enemySpecialAttacks;
            enemySpawnTimer = data.enemySpawnTimer;
            hitpointRegenInterval = data.hitpointRegenInterval;
            deadeyeAmulet = data.deadeyeAmulet;
            confettiCrossbow = data.confettiCrossbow;
            warlockAmulet = data.warlockAmulet;
            CURSEIDS = data.CURSEIDS;
        }

        /**
         * Simulation Method for a single monster
         * @param {EnemyStats} enemyStats
         * @param {PlayerStats} playerStats
         * @param {number} trials
         * @param {number} maxActions
         * @return {Promise<Object>}
         */
        async simulateMonster(enemyStats, playerStats, trials, maxActions) {
            // Multiply player special setDamage
            if (playerStats.specialData.setDamage) playerStats.specialData.setDamage *= numberMultiplier;
            playerStats.damageTaken = 0;
            playerStats.damageHealed = 0;
            playerStats.isPlayer = true;
            enemyStats.isPlayer = false;

            // Start Monte Carlo simulation
            let enemyKills = 0;

            // Stats from the simulation
            const stats = {
                totalTime: 0,
                playerAttackCalls: 0,
                enemyAttackCalls: 0,
                totalCombatXP: 0,
                totalHpXP: 0,
                totalPrayerXP: 0,
                gpGainedFromDamage: 0,
                playerActions: 0,
                enemyActions: 0,
                /** @type {PetRolls} */
                petRolls: {Prayer: {}, other: {}},
                runesUsed: 0,
            };

            setAreaEffects(playerStats, enemyStats);

            if (!playerStats.isMelee && enemyStats.monsterID === 147) {
                return {simSuccess: false, reason: 'wrong style'};
            }
            if (!playerStats.isRanged && enemyStats.monsterID === 148) {
                return {simSuccess: false, reason: 'wrong style'};
            }
            if (!playerStats.isMagic && enemyStats.monsterID === 149) {
                return {simSuccess: false, reason: 'wrong style'};
            }
            if (enemyStats.monsterID === 147 || enemyStats.monsterID === 148) {
                // can't curse these monsters
                playerStats.canCurse = false;
            }

            // Start simulation for each trial
            this.cancelStatus = false;
            const player = {};
            // Set Combat Triangle
            if (playerStats.hardcore) {
                player.reductionModifier = combatTriangle.hardcore.reductionModifier[playerStats.attackType][enemyStats.attackType];
                player.damageModifier = combatTriangle.hardcore.damageModifier[playerStats.attackType][enemyStats.attackType];
            } else {
                player.reductionModifier = combatTriangle.normal.reductionModifier[playerStats.attackType][enemyStats.attackType];
                player.damageModifier = combatTriangle.normal.damageModifier[playerStats.attackType][enemyStats.attackType];
            }
            // Multiply player max hit
            playerStats.maxHit = Math.floor(playerStats.maxHit * player.damageModifier);
            const enemy = {};
            let innerCount = 0;
            let tooManyActions = 0;
            while (enemyKills < trials) {
                // Reset Timers and statuses
                resetPlayer(player, playerStats, enemyStats);
                resetEnemy(enemy, playerStats, enemyStats);
                if (playerStats.canCurse) {
                    setEnemyCurseValues(enemy, playerStats.curseID, playerStats.curseData.effectValue);
                }

                // Simulate combat until enemy is dead or max actions has been reached
                let enemyAlive = true;
                while (enemyAlive) {
                    innerCount++
                    // Check Cancellation every 100000th loop
                    if (innerCount % 100000 === 0 && await this.isCanceled()) {
                        return {simSuccess: false, reason: 'cancelled'};
                    }
                    // check player action limit
                    if (player.actionsTaken > maxActions) {
                        break;
                    }

                    // Determine the time step
                    let timeStep = Infinity;
                    timeStep = determineTimeStep(player, timeStep);
                    timeStep = determineTimeStep(enemy, timeStep);

                    // exit on invalid time step
                    if (timeStep <= 0) {
                        return {
                            simSuccess: false,
                            reason: 'invalid time step: ' + timeStep,
                            playerActing: player.isActing,
                            playerActionTimer: player.actionTimer,
                            playerAttacking: player.isAttacking,
                            playerAttackTimer: player.attackTimer,
                            enemyActing: enemy.isActing,
                            enemyActionTimer: enemy.actionTimer,
                            enemyAttacking: enemy.isAttacking,
                            enemyAttackTimer: enemy.attackTimer,
                            player: player,
                            enemy: enemy,
                            monsterID: enemyStats.monsterID,
                        };
                    }
                    // combat time tracker
                    stats.totalTime += timeStep;
                    let initialHP = enemyStats.damageTaken;
                    if (enemyAlive && player.isActing) {
                        player.actionTimer -= timeStep;
                        if (player.actionTimer <= 0) {
                            playerAction(stats, player, playerStats, enemy, enemyStats);
                            if (initialHP !== enemyStats.damageTaken) {
                                enemyAlive = enemy.hitpoints > 0;
                                initialHP = enemy.hitpoints;
                            }
                            // TODO: how to handle multi-attacks when the monster is dead?
                            /*
                            if (player.isAttacking) {
                                enemyAlive = true;
                            }
                            */
                        }
                    }
                    if (enemyAlive && player.isAttacking) {
                        player.attackTimer -= timeStep;
                        if (player.attackTimer <= 0) {
                            playerContinueAction(stats, player, playerStats, enemy, enemyStats);
                            if (initialHP !== enemyStats.damageTaken) {
                                enemyAlive = enemy.hitpoints > 0;
                                initialHP = enemy.hitpoints;
                            }
                        }
                    }
                    if (enemyAlive && player.isBurning) {
                        player.burnTimer -= timeStep;
                        if (player.burnTimer <= 0) {
                            actorBurn(player, playerStats);
                        }
                    }
                    if (enemyAlive && player.isRecoiling) {
                        player.recoilTimer -= timeStep;
                        if (player.recoilTimer <= 0) {
                            actorRecoilCD(player);
                        }
                    }
                    if (enemyAlive && player.isBleeding) {
                        player.bleedTimer -= timeStep;
                        if (player.bleedTimer <= 0) {
                            actorBleed(player, playerStats);
                        }
                    }
                    //enemy
                    if (enemyAlive && enemy.isActing) {
                        enemy.actionTimer -= timeStep;
                        if (enemy.actionTimer <= 0) {
                            enemyAction(stats, player, playerStats, enemy, enemyStats);
                            if (initialHP !== enemyStats.damageTaken) {
                                enemyAlive = enemy.hitpoints > 0;
                                initialHP = enemy.hitpoints;
                            }
                        }
                    }
                    if (enemyAlive && enemy.isAttacking) {
                        enemy.attackTimer -= timeStep;
                        if (enemy.attackTimer <= 0) {
                            enemyContinueAction(stats, player, playerStats, enemy, enemyStats);
                            if (initialHP !== enemyStats.damageTaken) {
                                enemyAlive = enemy.hitpoints > 0;
                                initialHP = enemy.hitpoints;
                            }
                        }
                    }
                    if (enemyAlive && enemy.isBurning) {
                        enemy.burnTimer -= timeStep;
                        if (enemy.burnTimer <= 0) {
                            actorBurn(enemy, enemyStats);
                            if (initialHP !== enemyStats.damageTaken) {
                                enemyAlive = enemy.hitpoints > 0;
                                initialHP = enemy.hitpoints;
                            }
                        }
                    }
                    if (enemyAlive && enemy.isRecoiling) {
                        enemy.recoilTimer -= timeStep;
                        if (enemy.recoilTimer <= 0) {
                            actorRecoilCD(enemy);
                        }
                    }
                    if (enemyAlive && enemy.isBleeding) {
                        enemy.bleedTimer -= timeStep;
                        if (enemy.bleedTimer <= 0) {
                            actorBleed(enemy, enemyStats);
                            if (initialHP !== enemyStats.damageTaken) {
                                enemyAlive = enemy.hitpoints > 0;
                                initialHP = enemy.hitpoints;
                            }
                        }
                    }
                }
                if (isNaN(enemy.hitpoints)) {
                    console.log('Failed enemy simulation: ', enemyStats, enemy);
                    return {simSuccess: false, reason: 'bogus enemy hp'};
                }
                if (enemy.hitpoints > 0) {
                    tooManyActions++;
                }
                enemyKills++;
            }

            // Apply XP Bonuses
            // Ring bonus
            stats.totalCombatXP += stats.totalCombatXP * playerStats.xpBonus;
            stats.totalHpXP += stats.totalHpXP * playerStats.xpBonus;
            // TODO: this matches the bugged behaviour of 0.18?613 of Melvor Idle
            stats.totalPrayerXP += stats.totalPrayerXP * playerStats.xpBonus / 2;
            // Global XP Bonus
            stats.totalCombatXP *= playerStats.globalXPMult;
            stats.totalHpXP *= playerStats.globalXPMult;
            stats.totalPrayerXP *= playerStats.globalXPMult;

            // Final Result from simulation
            return simulationResult(stats, playerStats, enemyStats, trials, tooManyActions);
        };

        /**
         * Checks if the simulation has been messaged to be cancelled
         * @return {Promise<boolean>}
         */
        async isCanceled() {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(this.cancelStatus);
                });
            });
        }

        cancelSimulation() {
            this.cancelStatus = true;
        }
    }

    function determineTimeStep(actor, timeStep) {
        if (actor.isActing) {
            timeStep = Math.min(timeStep, actor.actionTimer);
        }
        if (actor.isAttacking) {
            timeStep = Math.min(timeStep, actor.attackTimer);
        }
        if (actor.isBurning) {
            timeStep = Math.min(timeStep, actor.burnTimer);
        }
        if (actor.isRecoiling) {
            timeStep = Math.min(timeStep, actor.recoilTimer);
        }
        if (actor.isBleeding) {
            timeStep = Math.min(timeStep, actor.bleedTimer);
        }
        return timeStep;
    }

    function actorRecoilCD(actor) {
        actor.canRecoil = true;
        actor.isRecoiling = false;
    }

    function actorBurn(actor, actorStats) {
        // reset timer
        actor.burnTimer = actor.burnInterval;
        // Check if stopped burning
        if (actor.burnCount >= actor.burnMaxCount) {
            actor.isBurning = false;
            return;
        }
        // Apply burn damage
        dealDamage(actor, actorStats, actor.burnDamage);
        actor.burnCount++;
    }

    function actorBleed(actor, actorStats) {
        // reset timer
        actor.bleedTimer = actor.bleedInterval;
        // Check if stopped bleeding
        if (actor.bleedCount >= actor.bleedMaxCount) {
            actor.isBleeding = false;
            return;
        }
        // Apply bleed damage
        dealDamage(actor, actorStats, actor.bleedDamage);
        actor.bleedCount++;
    }

    function enemyAction(stats, player, playerStats, enemy, enemyStats) {
        stats.enemyActions++;
        // Do enemy action
        if (skipsTurn(enemy)) {
            return;
        }
        stats.enemyAttackCalls++;
        // Check if doing special
        let isSpecial = false;
        if (enemyStats.hasSpecialAttack) {
            const chanceForSpec = Math.floor(Math.random() * 100);
            let specCount = 0;
            for (let i = 0; i < enemyStats.specialLength; i++) {
                if (chanceForSpec <= enemyStats.specialAttackChances[i] + specCount) {
                    enemy.specialID = enemyStats.specialIDs[i];
                    enemy.doingSpecial = true;
                    isSpecial = true;
                    break;
                }
                specCount += enemyStats.specialAttackChances[i];
            }
        }
        // Attack Parameters
        const special = enemyDoAttack(player, playerStats, enemy, enemyStats, isSpecial);
        enemyPostAttack(player, playerStats, enemy, enemyStats);
        enemyActionTimer(player, playerStats, enemy, enemyStats, isSpecial, special);
    }

    function enemyContinueAction(stats, player, playerStats, enemy, enemyStats) {
        // Do enemy multi attacks
        stats.enemyAttackCalls++;
        const special = enemyDoAttack(player, playerStats, enemy, enemyStats, true);
        enemyPostAttack(player, playerStats, enemy, enemyStats);
        enemyActionTimer(player, playerStats, enemy, enemyStats, true, special);
    }

    function enemyActionTimer(player, playerStats, enemy, enemyStats, isSpecial, special) {
        // set up timer for next attack
        if (isSpecial && enemy.isAttacking) {
            // handle multi-attack
            // Track attacks and determine next action
            enemy.attackCount++;
            if (enemy.attackCount >= enemy.countMax) {
                enemy.isAttacking = false;
                enemy.isActing = true;
                enemy.actionTimer = enemy.currentSpeed;
            } else {
                enemy.attackTimer = enemy.attackInterval;
            }
        } else if (isSpecial) {
            // Set up subsequent hits if required
            const isDOT = special.setDOTDamage !== null;
            const maxCount = isDOT ? special.DOTMaxProcs : special.attackCount;
            if (maxCount > 1) {
                enemy.attackCount = 1;
                enemy.countMax = maxCount;
                enemy.isActing = false;
                enemy.isAttacking = true;
                enemy.attackInterval = isDOT ? special.DOTInterval : special.attackInterval;
                enemy.attackTimer = enemy.attackInterval;
            } else {
                enemy.actionTimer = enemy.currentSpeed;
            }
        } else {
            enemy.actionTimer = enemy.currentSpeed;
        }
    }

    function canNotDodge(target) {
        return target.isStunned || target.sleep;
    }

    function applyStatus(statusEffect, damage, target, targetStats) {
        ////////////
        // turned //
        ////////////
        // Apply Stun
        if (canApplyStatus(statusEffect.canStun, target.isStunned, statusEffect.stunChance)) {
            applyStun(statusEffect, target);
        }
        // Apply Sleep
        if (canApplyStatus(statusEffect.canSleep, target.isSleeping)) {
            target.isSleeping = true;
            target.sleepTurns = statusEffect.sleepTurns;
            target.isAttacking = false;
            target.isActing = true;
            target.actionTimer = target.currentSpeed;
        }
        // Apply Slow
        if (canApplyStatus(statusEffect.attackSpeedDebuff, target.isSlowed)) {
            target.isSlowed = true;
            target.attackSpeedDebuffTurns = statusEffect.attackSpeedDebuffTurns;
            target.currentSpeed = Math.floor(targetStats.attackSpeed * (1 + statusEffect.attackSpeedDebuff / 100));
            // take attack speed reduction into account
            if (targetStats.decreasedAttackSpeed) {
                target.currentSpeed -= targetStats.decreasedAttackSpeed
            }
        }
        ///////////
        // timed //
        ///////////
        // Apply Burning
        if (canApplyStatus(statusEffect.burnDebuff, target.isBurning)) {
            target.isBurning = true;
            target.burnCount = 0;
            target.burnDamage = Math.floor((targetStats.maxHitpoints * (statusEffect.burnDebuff / 100)) / target.burnMaxCount);
            target.burnTimer = target.burnInterval;
        }
        // Apply Bleeding
        if (canApplyStatus(statusEffect.canBleed, target.isBleeding, statusEffect.bleedChance)) {
            applyBleeding(statusEffect, damage, target, targetStats);
        }
        ////////////
        // debuff //
        ////////////
        // evasion debuffs
        if (statusEffect.applyDebuffs && !target.activeDebuffs) {
            target.activeDebuffs = true;
            if (statusEffect.applyDebuffTurns !== null && statusEffect.applyDebuffTurns !== undefined) {
                target.debuffTurns = statusEffect.applyDebuffTurns;
            } else {
                target.debuffTurns = 2;
            }
            target.meleeEvasionDebuff = statusEffect.meleeEvasionDebuff;
            target.rangedEvasionDebuff = statusEffect.rangedEvasionDebuff;
            target.magicEvasionDebuff = statusEffect.magicEvasionDebuff;
        }
        // accuracy debuffs
        if (statusEffect.decreasePlayerAccuracy !== undefined) {
            if (statusEffect.decreasePlayerAccuracyStack) {
                target.decreasedAccuracy += statusEffect.decreasePlayerAccuracy;
                target.decreasedAccuracy = Math.min(target.decreasedAccuracy, statusEffect.decreasePlayerAccuracyLimit);
            } else {
                target.decreasedAccuracy += statusEffect.decreasePlayerAccuracy;
            }
        }
    }

    function canApplyStatus(can, is, chance) {
        if (!can || is) {
            return false;
        }
        if (chance !== undefined) {
            const stunRoll = Math.random() * 100;
            return chance > stunRoll;
        }
        return true;
    }

    function applyStun(statusEffect, target) {
        // apply new stun
        target.isStunned = true;
        target.stunTurns = statusEffect.stunTurns;
        target.isAttacking = false;
        target.isActing = true;
        target.actionTimer = target.currentSpeed;
    }

    function applyBleeding(statusEffect, damage, target, targetStats) {
        //apply new bleed
        target.isBleeding = true;
        target.bleedMaxCount = statusEffect.bleedCount;
        target.bleedInterval = statusEffect.bleedInterval;
        target.bleedTimer = target.bleedInterval;
        target.bleedCount = 0;
        if (statusEffect.totalBleedHP) {
            if (statusEffect.totalBleedHPCustom === 1) {
                target.bleedDamage = Math.floor((Math.random() * (damage * statusEffect.totalBleedHP)) / target.bleedCount);
            } else {
                // bleed for `statusEffect.totalBleedHP` times initial damage
                target.bleedDamage = Math.floor(damage * statusEffect.totalBleedHP / target.bleedMaxCount);
            }
        } else {
            // bleed for `statusEffect.totalBleedHPPercent` % of max HP
            target.bleedDamage = Math.floor(targetStats.hitpoints * statusEffect.totalBleedHPPercent / 100 / target.bleedMaxCount);
        }
    }

    function enemyDoAttack(player, playerStats, enemy, enemyStats, isSpecial) {
        let forceHit = false;
        let currentSpecial;
        if (isSpecial) {
            // Do Enemy Special
            currentSpecial = enemySpecialAttacks[enemy.specialID];
            // Activate Buffs
            if (currentSpecial.activeBuffs && !enemy.isBuffed) {
                enemy.isBuffed = true;
                if (currentSpecial.activeBuffTurns !== null && currentSpecial.activeBuffTurns !== undefined) {
                    enemy.buffTurns = currentSpecial.activeBuffTurns;
                } else {
                    enemy.buffTurns = currentSpecial.attackCount;
                }
                // Set evasion buffs
                if (currentSpecial.increasedMeleeEvasion) {
                    enemy.meleeEvasionBuff = 1 + currentSpecial.increasedMeleeEvasion / 100;
                }
                if (currentSpecial.increasedRangedEvasion) {
                    enemy.rangedEvasionBuff = 1 + currentSpecial.increasedRangedEvasion / 100;
                }
                if (currentSpecial.increasedMagicEvasion) {
                    enemy.magicEvasionBuff = 1 + currentSpecial.increasedMagicEvasion / 100;
                }
                // set reflect melee attack buff
                if (currentSpecial.reflectMelee) {
                    enemy.reflectMelee = currentSpecial.reflectMelee;
                }
                // set increased DR buff
                if (currentSpecial.increasedDamageReduction) {
                    enemy.damageReduction = currentSpecial.increasedDamageReduction;
                }
                // update player accuracy
                player.accuracy = calculateAccuracy(player, playerStats, enemy, enemyStats);
            }
            forceHit = currentSpecial.forceHit;
        }
        // Do the first hit
        let attackHits;
        if (canNotDodge(player) || forceHit) {
            attackHits = true;
        } else {
            // Roll for hit
            const hitChance = Math.floor(Math.random() * 100);
            attackHits = enemy.accuracy > hitChance;
        }

        if (attackHits) {
            //////////////////
            // apply damage //
            //////////////////
            const damage = enemyCalculateDamage(enemy, player, isSpecial, currentSpecial);
            dealDamage(player, playerStats, damage);
            //////////////////
            // side effects //
            //////////////////
            // life steal
            if (isSpecial && currentSpecial.lifesteal) {
                enemy.hitpoints += damage * currentSpecial.lifestealMultiplier;
                enemy.hitpoints = Math.min(enemy.hitpoints, enemyStats.hitpoints);
            }
            // player recoil
            if (player.canRecoil) {
                let reflectDamage = 0;
                if (playerStats.activeItems.goldSapphireRing) {
                    reflectDamage += Math.floor(Math.random() * 3 * numberMultiplier);
                }
                if (playerStats.reflectDamage) {
                    reflectDamage += damage * playerStats.reflectDamage / 100
                }
                if (enemy.hitpoints > reflectDamage && reflectDamage > 0) {
                    dealDamage(enemy, enemyStats, reflectDamage);
                    player.canRecoil = false;
                    player.isRecoiling = true;
                    player.recoilTimer = 2000;
                }
            }
            // confusion curse
            if (enemy.isCursed && enemy.curse.type === 'Confusion') {
                dealDamage(enemy, enemyStats, Math.floor(enemy.hitpoints * enemy.curse.confusionMult));
            }
            // guardian amulet
            if (playerStats.activeItems.guardianAmulet && player.reductionBuff < 12) {
                player.reductionBuff += 2;
                player.damageReduction = Math.floor((playerStats.damageReduction + player.reductionBuff) * player.reductionModifier);
            }
            // status effects
            if (isSpecial) {
                applyStatus(currentSpecial, damage, player, playerStats)
            }
        }
        return currentSpecial;
    }

    function enemyPostAttack(player, playerStats, enemy, enemyStats) {
        // Buff tracking
        if (enemy.isBuffed) {
            enemy.buffTurns--;
            if (enemy.buffTurns <= 0) {
                enemy.isBuffed = false;
                // Undo buffs
                player.accuracy = calculateAccuracy(player, playerStats, enemy, enemyStats);
                enemy.reflectMelee = 0;
                enemy.damageReduction = 0;
            }
        }
        // Slow Tracking
        if (enemy.isSlowed) {
            enemy.slowTurns--;
            if (enemy.slowTurns <= 0) {
                enemy.isSlowed = false;
                enemy.currentSpeed = enemyStats.attackSpeed;
            }
        }
        // Curse Tracking
        if (enemy.isCursed) {
            enemyCurseUpdate(player, enemy, enemyStats);
        }
    }

    function enemyCurseUpdate(player, enemy, enemyStats) {
        // don't curse
        if (enemy.isAttacking) {
            return;
        }
        // Apply decay
        if (enemy.curse.type === 'Decay') {
            dealDamage(enemy, enemyStats, enemy.curse.decayDamage);
        }
        // reduce remaining curse turns
        enemy.curseTurns--;
        if (enemy.curseTurns > 0) {
            return;
        }
        // no curse turns remaining, revert stat changes
        enemy.isCursed = false;
        switch (enemy.curse.type) {
            case 'Blinding':
                enemy.maxAttackRoll = enemyStats.maxAttackRoll;
                if (!playerStats.isProtected) {
                    enemy.accuracy = calculateAccuracy(enemy, enemyStats, player, playerStats);
                }
                break;
            case 'Soul Split':
            case 'Decay':
                player.accuracy = calculateAccuracy(player, playerStats, enemy, enemyStats);
                break;
            case 'Weakening':
                enemy.maxHit = enemyStats.maxHit;
                break;
        }
    }

    function skipsTurn(actor) {
        // reduce stun
        if (actor.isStunned) {
            actor.stunTurns--;
            if (actor.stunTurns <= 0) {
                actor.isStunned = false;
            }
            actor.actionTimer = actor.currentSpeed;
            return true
        }
        // reduce sleep
        if (actor.sleep) {
            actor.sleepTurns--;
            if (actor.sleepTurns <= 0) {
                actor.sleep = false;
                actor.sleepTurns = 0;
            }
            actor.actionTimer = actor.currentSpeed;
            return true
        }
    }

    function playerAction(stats, player, playerStats, enemy, enemyStats) {
        // player action: reduce stun count or attack
        stats.playerActions++;
        if (skipsTurn(player)) {
            return;
        }
        // attack
        player.actionsTaken++;
        // track rune usage
        if (playerStats.usingMagic) {
            stats.runesUsed += playerStats.runeCosts.spell * (1 - playerStats.runePreservation) + playerStats.runeCosts.aurora;
        }
        // determine special or normal attack
        let specialAttack = playerStats.usingAncient;
        if (!specialAttack && playerStats.hasSpecialAttack) {
            // Roll for player special
            const specialRoll = Math.floor(Math.random() * 100);
            if (specialRoll <= playerStats.specialData.chance) {
                specialAttack = true;
            }
        }
        // do normal or special attack
        const attackResult = playerDoAttack(stats, player, playerStats, enemy, enemyStats, specialAttack)
        processPlayerAttackResult(attackResult, stats, player, playerStats, enemy, enemyStats);
        playerUpdateActionTimer(player, playerStats, specialAttack);
    }

    function playerContinueAction(stats, player, playerStats, enemy, enemyStats) {
        // perform continued attack
        const attackResult = playerDoAttack(stats, player, playerStats, enemy, enemyStats, true);
        processPlayerAttackResult(attackResult, stats, player, playerStats, enemy, enemyStats);
        playerUpdateActionTimer(player, playerStats, false);
    }

    function dealDamage(target, targetStats, damage) {
        target.hitpoints -= Math.floor(damage);
        targetStats.damageTaken += Math.floor(damage);
    }

    function processPlayerAttackResult(attackResult, stats, player, playerStats, enemy, enemyStats) {
        if (!attackResult.attackHits) {
            // attack missed, nothing to do
            return;
        }
        // damage
        dealDamage(enemy, enemyStats, Math.floor(attackResult.damageToEnemy));
        // XP Tracking
        if (attackResult.damageToEnemy > 0) {
            let xpToAdd = attackResult.damageToEnemy / numberMultiplier * 4;
            if (xpToAdd < 4) {
                xpToAdd = 4;
            }
            stats.totalHpXP += attackResult.damageToEnemy / numberMultiplier * 1.33;
            stats.totalPrayerXP += attackResult.damageToEnemy * playerStats.prayerXpPerDamage;
            stats.totalCombatXP += xpToAdd;
            if (playerStats.prayerXpPerDamage > 0) {
                stats.petRolls.Prayer[player.currentSpeed] = (stats.petRolls.Prayer[player.currentSpeed] || 0) + 1;
            }
        }
        if (attackResult.isSpecial) {
            applyStatus(attackResult.statusEffect, attackResult.damageToEnemy, enemy, enemyStats)
        }
    }

    function playerUsePreAttackSpecial(player, playerStats, enemy, enemyStats) {
        if (playerStats.specialData.decreasedRangedEvasion) {
            enemy.decreasedRangedEvasion = playerStats.specialData.decreasedRangedEvasion;
            player.accuracy = calculateAccuracy(player, playerStats, enemy, enemyStats);
        }
    }

    function playerUpdateActionTimer(player, playerStats, specialAttack) {
        // Player Slow Tracking
        if (player.isSlowed) {
            player.slowTurns--;
            if (player.slowTurns <= 0) {
                player.isSlowed = false;
                player.currentSpeed = playerStats.attackSpeed - playerStats.decreasedAttackSpeed;
            }
        }
        player.actionTimer = player.currentSpeed;
        // process ongoing multi-attack
        if (player.isAttacking) {
            // Track attacks and determine next action
            player.attackCount++;
            if (player.attackCount >= player.countMax) {
                player.isAttacking = false;
                player.isActing = true;
            } else {
                player.attackTimer = playerStats.specialData.attackInterval;
            }
            return;
        }
        // trigger multi attack
        if (specialAttack && playerStats.specialData.attackCount > 1) {
            player.attackCount = 1;
            player.countMax = playerStats.specialData.attackCount;
            player.isActing = false;
            player.isAttacking = true;
            player.attackTimer = playerStats.specialData.attackInterval;
        }
    }

    function playerUseCurse(stats, player, playerStats, enemy, enemyStats) {
        if (!playerStats.canCurse || enemy.isCursed) {
            return;
        }
        stats.runesUsed += playerStats.runeCosts.curse;
        enemy.isCursed = true;
        enemy.curseTurns = 3;
        // Update the curses that change stats
        switch (enemy.curse.type) {
            case 'Blinding':
                enemy.maxAttackRoll = Math.floor(enemy.maxAttackRoll * enemy.curse.accuracyDebuff);
                if (!playerStats.isProtected) {
                    enemy.accuracy = calculateAccuracy(enemy, enemyStats, player, playerStats);
                }
                break;
            case 'Soul Split':
            case 'Decay':
                player.accuracy = calculateAccuracy(player, playerStats, enemy, enemyStats);
                break;
            case 'Weakening':
                enemy.maxHit = Math.floor(enemy.maxHit * enemy.curse.maxHitDebuff);
                break;
        }
    }

    function playerDoAttack(stats, player, playerStats, enemy, enemyStats, isSpecial) {
        stats.playerAttackCalls++;
        // Apply pre-attack special effects
        playerUsePreAttackSpecial(player, playerStats, enemy, enemyStats);
        // Apply curse
        playerUseCurse(stats, player, playerStats, enemy, enemyStats);
        // default return values
        const attackResult = {
            attackHits: false,
            isSpecial: isSpecial,
            statusEffect: {},
        };
        // Check for guaranteed hit
        let attackHits = enemy.isStunned || (isSpecial && playerStats.specialData.forceHit);
        if (!attackHits) {
            // Roll for hit
            let hitChance = Math.floor(Math.random() * 100);
            if (playerStats.diamondLuck) {
                const hitChance2 = Math.floor(Math.random() * 100);
                if (hitChance > hitChance2) hitChance = hitChance2;
            }
            if (player.accuracy > hitChance) attackHits = true;
        }
        if (!attackHits) {
            // exit early
            return attackResult;
        }
        // roll for pets
        stats.petRolls.other[player.currentSpeed] = (stats.petRolls.other[player.currentSpeed] || 0) + 1;
        // calculate damage
        attackResult.damageToEnemy = playerCalculateDamage(player, playerStats, enemy, isSpecial);

        // healing special
        if (isSpecial && playerStats.specialData.healsFor > 0) {
            playerStats.damageHealed += Math.floor(attackResult.damageToEnemy * playerStats.specialData.healsFor);
        }
        // reflect melee damage
        if (enemy.reflectMelee > 0) {
            dealDamage(player, playerStats, enemy.reflectMelee * numberMultiplier);
        }
        ////////////////////
        // status effects //
        ////////////////////
        let statusEffect = {}
        // Bleed
        if (isSpecial && playerStats.specialData.canBleed && !enemy.isBleeding) {
            statusEffect.canBleed = true;
            if (playerStats.specialData.bleedChance !== undefined) {
                const bleedRoll = Math.random() * 100;
                statusEffect.canBleed = playerStats.specialData.bleedChance > bleedRoll;
            }
            if (statusEffect.canBleed) {
                statusEffect.bleedCount = playerStats.specialData.bleedCount;
                statusEffect.totalBleedHPPercent = playerStats.specialData.totalBleedHPPercent;
                statusEffect.bleedInterval = playerStats.specialData.bleedInterval;
                statusEffect.totalBleedHP = playerStats.specialData.totalBleedHP;
            }
        }
        // Stun
        if (isSpecial) {
            statusEffect.canStun = playerStats.specialData.canStun;
            if (playerStats.specialData.stunChance !== undefined) {
                const stunRoll = Math.random() * 100;
                statusEffect.canStun = playerStats.specialData.stunChance > stunRoll;
            }
            if (statusEffect.canStun) {
                statusEffect.stunTurns = playerStats.specialData.stunTurns;
            }
        }
        if (playerStats.activeItems.fighterAmulet && attackResult.damageToEnemy >= playerStats.maxHit * 0.70) {
            statusEffect.canStun = true;
            statusEffect.stunTurns = 1;
        }
        // Sleep
        if (isSpecial && playerStats.specialData.canSleep) {
            statusEffect.canSleep = true;
            statusEffect.sleepTurns = playerStats.specialData.sleepTurns;
        }
        // life steal
        let lifeSteal = 0;
        if (isSpecial && playerStats.specialData.healsFor) {
            lifeSteal += playerStats.specialData.healsFor * 100;
        }
        if (playerStats.spellHeal && playerStats.isMagic) {
            lifeSteal += playerStats.spellHeal;
        }
        if (playerStats.lifesteal !== 0) {
            // fervor + passive item stat
            lifeSteal += playerStats.lifesteal;
        }
        if (lifeSteal > 0) {
            playerStats.damageHealed += Math.floor(attackResult.damageToEnemy * lifeSteal / 100);
        }
        // slow
        if (isSpecial && playerStats.specialData.attackSpeedDebuff && !enemy.isSlowed) {
            statusEffect.isSlowed = true;
            statusEffect.slowTurns = playerStats.specialData.attackSpeedDebuffTurns;
            statusEffect.attackSpeedDebuff = playerStats.specialData.attackSpeedDebuff;
        }

        // confetti crossbow
        if (playerStats.activeItems.confettiCrossbow) {
            // Add gp from this weapon
            let gpMultiplier = playerStats.startingGP / 25000000;
            if (gpMultiplier > confettiCrossbow.gpMultiplierCap) {
                gpMultiplier = confettiCrossbow.gpMultiplierCap;
            } else if (gpMultiplier < confettiCrossbow.gpMultiplierMin) {
                gpMultiplier = confettiCrossbow.gpMultiplierMin;
            }
            stats.gpGainedFromDamage += Math.floor(attackResult.damageToEnemy * gpMultiplier);
        }

        // return the result of the attack
        attackResult.attackHits = true;
        attackResult.statusEffect = statusEffect;
        return attackResult;
    }

    function enemyCalculateDamage(actor, target, isSpecial, special) {
        let damage;
        if (isSpecial && special.setDamage !== null) {
            damage = special.setDamage * numberMultiplier;
        } else {
            damage = Math.floor(Math.random() * actor.maxHit) + 1;
        }
        return damage * damageModifiers(actor, target, isSpecial, special);
    }

    function damageModifiers(actor, target, isSpecial, special) {
        let modifier = 1;
        if (isSpecial && !actor.isAttacking && target.isStunned) {
            modifier *= special.stunDamageMultiplier;
        }
        if (isSpecial && !actor.isAttacking && target.sleep) {
            modifier *= special.sleepDamageMultiplier;
        }
        modifier *= (1 - (target.damageReduction / 100))
        return modifier;
    }

    function playerCalculateDamage(player, playerStats, enemy, isSpecial) {
        let damageToEnemy;
        // Calculate attack Damage
        if (isSpecial && playerStats.specialData.setDamage) {
            damageToEnemy = playerStats.specialData.setDamage * playerStats.specialData.damageMultiplier * player.damageModifier;
        } else if (isSpecial && playerStats.specialData.maxHit) {
            damageToEnemy = playerStats.maxHit * playerStats.specialData.damageMultiplier;
        } else if (isSpecial && playerStats.specialData.stormsnap) {
            damageToEnemy = (6 + 6 * playerStats.levels.Magic) * player.damageModifier;
        } else {
            if (player.alwaysMaxHit) {
                damageToEnemy = playerStats.maxHit;
            } else {
                damageToEnemy = rollForDamage(playerStats);
            }
            if (isSpecial) {
                damageToEnemy *= playerStats.specialData.damageMultiplier;
            }
        }
        // player specific modifiers
        if (enemy.isCursed && enemy.curse.type === 'Anguish') {
            damageToEnemy *= enemy.curse.damageMult;
        }
        if (playerStats.activeItems.deadeyeAmulet) {
            damageToEnemy *= critDamageModifier(damageToEnemy);
        }
        // common modifiers
        damageToEnemy *= damageModifiers(player, enemy, isSpecial, playerStats.specialData)
        // cap damage, no overkill
        if (enemy.hitpoints < damageToEnemy) {
            damageToEnemy = enemy.hitpoints;
        }
        return damageToEnemy;
    }

    function resetCommonStats(common, attackSpeed) {
        // action
        common.doingSpecial = false;
        common.isActing = true;
        common.attackTimer = 0;
        common.isAttacking = false;
        // action speed
        common.actionTimer = attackSpeed;
        common.currentSpeed = attackSpeed;
        // stun
        common.isStunned = false;
        common.stunTurns = 0;
        // sleep
        common.sleep = false;
        common.sleepTurns = 0;
        // bleed
        common.bleedTimer = 0;
        common.isBleeding = false;
        common.bleedMaxCount = 0;
        common.bleedInterval = 0;
        common.bleedCount = 0;
        common.bleedDamage = 0;
        // burn
        common.burnTimer = 0;
        common.isBurning = false;
        common.burnMaxCount = 10;
        common.burnCount = 0;
        common.burnDamage = 0;
        common.burnInterval = 500;
        // slow
        common.isSlowed = false;
        common.slowTurns = 0;
        // buff
        common.isBuffed = false;
        common.buffTurns = 0;
        // curse
        common.isCursed = false;
        common.curseTurns = 0;
        //recoil
        common.canRecoil = true;
        common.isRecoiling = false;
        common.recoilTimer = 0;
        // multi attack
        common.attackCount = 0;
        common.countMax = 0;
        // debuffs
        common.magicEvasionDebuff = 0;
        common.meleeEvasionDebuff = 0;
        common.rangedEvasionDebuff = 0;
        common.decreasedAccuracy = 0;
    }

    function resetPlayer(player, playerStats, enemyStats) {
        resetCommonStats(player, playerStats.attackSpeed - playerStats.decreasedAttackSpeed);
        player.isPlayer = true;
        player.hitpoints = 0;
        player.reductionBuff = 0;
        player.damageReduction = Math.floor(playerStats.damageReduction * player.reductionModifier);
        player.actionsTaken = 0;
        player.accuracy = calculateAccuracy(playerStats, playerStats, enemyStats, enemyStats);
        player.alwaysMaxHit = playerStats.minHit + 1 >= playerStats.maxHit; // Determine if player always hits for maxHit
    }


    function resetEnemy(enemy, playerStats, enemyStats) {
        resetCommonStats(enemy, enemyStats.attackSpeed);
        enemy.isPlayer = false;
        enemy.hitpoints = enemyStats.hitpoints;
        enemy.damageReduction = 0;
        enemy.reflectMelee = 0;
        enemy.specialID = null;
        enemy.attackInterval = 0;
        enemy.maxAttackRoll = enemyStats.maxAttackRoll;
        enemy.maxHit = enemyStats.maxHit;
        enemy.maxDefRoll = enemyStats.maxDefRoll;
        enemy.maxMagDefRoll = enemyStats.maxMagDefRoll;
        enemy.maxRngDefRoll = enemyStats.maxRngDefRoll;
        enemy.decreasedRangedEvasion = 0;
        enemy.meleeEvasionBuff = 1;
        enemy.magicEvasionBuff = 1;
        enemy.rangedEvasionBuff = 1;
        enemy.attackType = enemyStats.attackType;
        if (enemy.curse === undefined) {
            enemy.curse = {};
        }
        enemy.curse.type = '';
        enemy.curse.accuracyDebuff = 1;
        enemy.curse.maxHitDebuff = 1;
        enemy.curse.damageMult = 1;
        enemy.curse.magicEvasionDebuff = 1;
        enemy.curse.meleeEvasionDebuff = 1;
        enemy.curse.rangedEvasionDebuff = 1;
        enemy.curse.confusionMult = 0;
        enemy.curse.decayDamage = 0;
        // Set accuracy based on protection prayers or stats
        enemy.accuracy = calculateAccuracy(enemyStats, enemyStats, playerStats, playerStats);
    }

    function simulationResult(stats, playerStats, enemyStats, trials, tooManyActions) {
        /** @type {MonsterSimResult} */
        const simResult = {
            simSuccess: true,
            petRolls: {},
            tooManyActions: tooManyActions,
        };


        simResult.xpPerHit = stats.totalCombatXP / stats.playerAttackCalls;
        // xp per second
        const totalTime = (trials - tooManyActions) * enemySpawnTimer + stats.totalTime;
        simResult.xpPerSecond = stats.totalCombatXP / totalTime * 1000;
        simResult.hpXpPerSecond = stats.totalHpXP / totalTime * 1000;
        simResult.prayerXpPerSecond = stats.totalPrayerXP / totalTime * 1000;
        // resource use
        // pp
        simResult.ppConsumedPerSecond = stats.playerAttackCalls * playerStats.prayerPointsPerAttack / totalTime * 1000;
        simResult.ppConsumedPerSecond += stats.enemyAttackCalls * playerStats.prayerPointsPerEnemy / totalTime * 1000;
        simResult.ppConsumedPerSecond += playerStats.prayerPointsPerHeal / hitpointRegenInterval * 1000;
        // hp
        let damage = playerStats.damageTaken;
        damage -= playerStats.damageHealed;
        damage -= playerStats.avgHPRegen * totalTime / hitpointRegenInterval;
        simResult.hpPerSecond = Math.max(0, damage / totalTime * 1000);
        // attacks
        simResult.attacksTakenPerSecond = stats.enemyAttackCalls / totalTime * 1000;
        simResult.attacksMadePerSecond = stats.playerAttackCalls / totalTime * 1000;
        // ammo
        simResult.ammoUsedPerSecond = playerStats.isRanged ? simResult.attacksMadePerSecond : 0;
        simResult.ammoUsedPerSecond *= 1 - playerStats.ammoPreservation / 100;
        // runes
        simResult.runesUsedPerSecond = stats.runesUsed / totalTime * 1000;
        // damage
        simResult.avgHitDmg = enemyStats.damageTaken / stats.playerAttackCalls;
        simResult.dmgPerSecond = enemyStats.damageTaken / totalTime * 1000;
        // gp
        simResult.gpFromDamagePerSecond = stats.gpGainedFromDamage / totalTime * 1000;

        // stats depending on kills
        if (tooManyActions === 0) {
            // kill time
            simResult.avgKillTime = totalTime / trials;
            simResult.killTimeS = simResult.avgKillTime / 1000;
            simResult.killsPerSecond = 1 / simResult.killTimeS;
        } else {
            // kill time
            simResult.avgKillTime = NaN;
            simResult.killTimeS = NaN;
            simResult.killsPerSecond = 0;
        }

        // Throw pet rolls in here to be further processed later
        Object.keys(stats.petRolls).forEach((petType) =>
            simResult.petRolls[petType] = Object.keys(stats.petRolls[petType]).map(attackSpeed => ({
                speed: parseInt(attackSpeed),
                rollsPerSecond: stats.petRolls[petType][attackSpeed] / totalTime * 1000,
            }))
        );
        // return successful results
        return simResult;
    }

    // TODO: duplicated in injectable/Simulator.js
    /**
     * Computes the accuracy of actor vs target
     * @param {Object} actor
     * @param {number} actor.attackType Attack Type Melee:0, Ranged:1, Magic:2
     * @param {number} actor.maxAttackRoll Accuracy Rating
     * @param {Object} target
     * @param {number} target.maxDefRoll Melee Evasion Rating
     * @param {number} target.maxRngDefRoll Ranged Evasion Rating
     * @param {number} target.maxMagDefRoll Magic Evasion Rating
     * @return {number}
     */
    function calculateAccuracy(actor, actorStats, target, targetStats) {
        // determine attack roll
        let maxAttackRoll = actorStats.maxAttackRoll;
        if (actor.decreasedAccuracy) {
            maxAttackRoll = Math.floor(maxAttackRoll * (1 - actor.decreasedAccuracy / 100));
        }
        if (actor.isCursed && actor.curse.accuracyDebuff) {
            maxAttackRoll = Math.floor(maxAttackRoll * actor.curse.accuracyDebuff);
        }
        // handle player and enemy cases
        if (target.isPlayer) {
            if (targetStats.isProtected) {
                return 100 - protectFromValue;
            }
            setEvasionDebuffsPlayer(target, targetStats, actorStats);
        } else {
            // Adjust ancient magick forcehit
            if (actorStats.usingAncient && (actorStats.specialData[0].forceHit || actorStats.specialData[0].checkForceHit)) {
                actorStats.specialData[0].forceHit = maxAttackRoll > 20000;
                actorStats.specialData[0].checkForceHit = true;
            }
            setEvasionDebuffsEnemy(target, targetStats);
        }
        // determine relevant defence roll
        let targetDefRoll;
        if (actor.isMelee) {
            targetDefRoll = target.maxDefRoll;
        } else if (actor.isRanged) {
            targetDefRoll = target.maxRngDefRoll;
        } else {
            targetDefRoll = target.maxMagDefRoll;
        }
        // accuracy based on attack roll and defence roll
        let acc;
        if (maxAttackRoll < targetDefRoll) {
            acc = (0.5 * maxAttackRoll / targetDefRoll) * 100;
        } else {
            acc = (1 - 0.5 * targetDefRoll / maxAttackRoll) * 100;
        }
        return acc;
    }

    /**
     * Modifies the stats of the enemy by the curse
     * @param {Object} enemy
     * @param {number} curseID
     * @param {number|number[]} effectValue
     */
    function setEnemyCurseValues(enemy, curseID, effectValue) {
        switch (curseID) {
            case CURSEIDS.Blinding_I:
            case CURSEIDS.Blinding_II:
            case CURSEIDS.Blinding_III:
                enemy.curse.accuracyDebuff = 1 - effectValue / 100;
                enemy.curse.type = 'Blinding';
                break;
            case CURSEIDS.Soul_Split_I:
            case CURSEIDS.Soul_Split_II:
            case CURSEIDS.Soul_Split_III:
                enemy.curse.magicEvasionDebuff = 1 - effectValue / 100;
                enemy.curse.type = 'Soul Split';
                break;
            case CURSEIDS.Weakening_I:
            case CURSEIDS.Weakening_II:
            case CURSEIDS.Weakening_III:
                enemy.curse.maxHitDebuff = 1 - effectValue / 100;
                enemy.curse.type = 'Weakening';
                break;
            case CURSEIDS.Anguish_I:
            case CURSEIDS.Anguish_II:
            case CURSEIDS.Anguish_III:
                enemy.curse.damageMult = 1 + effectValue / 100;
                enemy.curse.type = 'Anguish';
                break;
            case CURSEIDS.Decay:
                enemy.curse.meleeEvasionDebuff = 1 - effectValue[1] / 100;
                enemy.curse.magicEvasionDebuff = 1 - effectValue[1] / 100;
                enemy.curse.rangedEvasionDebuff = 1 - effectValue[1] / 100;
                enemy.curse.decayDamage = Math.floor(enemy.hitpoints * effectValue[0] / 100);
                enemy.curse.type = 'Decay';
                break;
            case CURSEIDS.Confusion:
                enemy.curse.confusionMult = effectValue / 100;
                enemy.curse.type = 'Confusion';
                break;
        }
    }

    /**
     * Rolls for damage for a regular attack
     * @param {playerStats} playerStats
     * @returns {number} damage
     */
    function rollForDamage(playerStats) {
        return Math.ceil(Math.random() * (playerStats.maxHit - playerStats.minHit)) + playerStats.minHit;
    }

    /**
     * Rolls for a chance of Deadeye Amulet's crit damage
     * @param {damageToEnemy} damageToEnemy
     * @returns {damageToEnemy} `damageToEnemy`, possibly multiplied by Deadeye Amulet's crit bonus
     */
    function critDamageModifier(damageToEnemy) {
        const chance = Math.random() * 100;
        if (chance < deadeyeAmulet.chanceToCrit) {
            return deadeyeAmulet.critDamage;
        }
        return 1;
    }

    /**
     * Modifies the stats of the enemy by the curse
     * @param {enemyStats} enemyStats
     * @param {Object} enemy
     */
    function setEvasionDebuffsEnemy(enemy, enemyStats) {
        const isCursed = enemy.isCursed && (curse.type === 'Decay' || curse.type === 'Soul Split');
        enemy.maxDefRoll = calculateEnemyEvasion(enemyStats.maxDefRoll, enemy.decreasedMeleeEvasion, enemy.meleeEvasionBuff, isCursed ? enemy.curse.meleeEvasionDebuff : 0);
        enemy.maxRngDefRoll = calculateEnemyEvasion(enemyStats.maxRngDefRoll, enemy.decreasedRangedEvasion, enemy.rangedEvasionBuff, isCursed ? enemy.curse.rangedEvasionDebuff : 0);
        enemy.maxMagDefRoll = calculateEnemyEvasion(enemyStats.maxMagDefRoll, enemy.decreasedMagicEvasion, enemy.magicEvasionBuff, isCursed ? enemy.curse.magicEvasionDebuff : 0);
    }

    function calculateEnemyEvasion(initial, decreasedEvasion, evasionBuff, curseEvasionDebuff) {
        let maxRoll = initial;
        if (decreasedEvasion) {
            maxRoll = Math.floor(maxRoll * (1 - decreasedEvasion / 100));
        }
        if (evasionBuff) {
            maxRoll = Math.floor(maxRoll * evasionBuff);
        }
        if (curseEvasionDebuff) {
            maxRoll = Math.floor(maxRoll * curseEvasionDebuff);
        }
        return maxRoll
    }

    function setEvasionDebuffsPlayer(player, playerStats, enemyStats) {
        let areaEvasionDebuff = 0;
        if (enemyStats.slayerArea === 9 /*Perilous Peaks*/) {
            areaEvasionDebuff = calculateAreaEffectValue(30, playerStats);
        }
        player.maxDefRoll = calculatePlayerEvasion(playerStats.maxDefRoll, player.meleeEvasionBuff, player.meleeEvasionDebuff + areaEvasionDebuff);
        player.maxDefRoll = calculatePlayerEvasion(playerStats.maxRngDefRoll, player.rangedEvasionBuff, player.rangedEvasionDebuff + areaEvasionDebuff);
        if (enemyStats.slayerArea === 6 /*Runic Ruins*/ && !playerStats.isMagic) {
            areaEvasionDebuff = calculateAreaEffectValue(30, playerStats);
        }
        player.maxDefRoll = calculatePlayerEvasion(playerStats.maxMagDefRoll, player.magicEvasionBuff, player.magicEvasionDebuff + areaEvasionDebuff);
    }

    function calculatePlayerEvasion(initial, evasionBuff, evasionDebuff) {
        let maxRoll = initial;
        if (evasionBuff) {
            maxRoll = Math.floor(maxRoll * (1 + evasionBuff / 100));
        }
        maxRoll = Math.floor(maxRoll * (1 - evasionDebuff / 100));
        return maxRoll
    }

    // Slayer area effect value
    function calculateAreaEffectValue(base, playerStats) {
        let value = Math.floor(base * (1 - playerStats.slayerAreaEffectNegationPercent / 100));
        value -= playerStats.slayerAreaEffectNegationFlat;
        if (value < 0) {
            value = 0;
        }
        return value;
    }

    function setAreaEffects(playerStats, enemyStats) {
        // 0: "Penumbra" - no area effect
        // 1: "Strange Cave" - no area effect
        // 2: "High Lands" - no area effect
        // 3: "Holy Isles" - no area effect
        // 4: "Forest of Goo" - no area effect
        // 5: "Desolate Plains" - no area effect
        // 6: "Runic Ruins" - reduced evasion rating -> implemented in setEvasionDebuffsPlayer
        // 7: "Arid Plains" - reduced food efficiency -> not relevant
        // 8: "Shrouded Badlands"
        if (enemyStats.slayerArea === 8 /*Shrouded Badlands*/) {
            playerStats.maxAttackRoll = Math.floor(playerStats.maxAttackRoll * (1 - calculateAreaEffectValue(30, playerStats) / 100));
        }
        // 9: "Perilous Peaks" - reduced evasion rating -> implemented in setEvasionDebuffsPlayer
        // 10: "Dark Waters" TODO: dark waters permanent Slow is not implemented in game
    }

})();