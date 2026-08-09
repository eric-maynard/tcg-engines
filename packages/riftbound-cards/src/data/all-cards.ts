/**
 * Card registry - all cards indexed by ID
 */

import type { Card } from "@tcg/riftbound-types/cards";

import * as ogn from "../cards/ogn";
import * as ogs from "../cards/ogs";
import * as sfd from "../cards/sfd";
import * as unl from "../cards/unl";
import { enrichCards } from "./enrich-cards";

/** Cached enriched cards */
let _cachedCards: Card[] | null = null;

/**
 * Get raw cards without parsed abilities.
 */
export function getRawCards(): Card[] {
  return [
    ogn.blazingScorcher as Card,
    ogn.brazenBuccaneer as Card,
    ogn.chemtechEnforcer as Card,
    ogn.cleave as Card,
    ogn.disintegrate as Card,
    ogn.flameChompers as Card,
    ogn.furyRune as Card,
    ogn.getExcited as Card,
    ogn.hextechRay as Card,
    ogn.legionRearguard as Card,
    ogn.magmaWurm as Card,
    ogn.noxusHopeful as Card,
    ogn.poutyPoro as Card,
    ogn.skySplitter as Card,
    ogn.captainFarron as Card,
    ogn.dangerousDuo as Card,
    ogn.ironBallista as Card,
    ogn.noxusSaboteur as Card,
    ogn.ragingSoul as Card,
    ogn.scrapyardChampion as Card,
    ogn.sunDisc as Card,
    ogn.thermoBeam as Card,
    ogn.unlicensedArmory as Card,
    ogn.voidSeeker as Card,
    ogn.blindFury as Card,
    ogn.brynhirThundersong as Card,
    ogn.dariusTrifarian as Card,
    ogn.dravenShowboat as Card,
    ogn.fallingStar as Card,
    ogn.jinxDemolitionist as Card,
    ogn.ragingFirebrand as Card,
    ogn.ravenbornTome as Card,
    ogn.shakedown as Card,
    ogn.tryndamereBarbarian as Card,
    ogn.vayneHunter as Card,
    ogn.viDestructive as Card,
    ogn.immortalPhoenix as Card,
    ogn.kadregrinTheInfernal as Card,
    ogn.kaisaSurvivor as Card,
    ogn.sealOfRage as Card,
    ogn.volibearFurious as Card,
    ogn.calmRune as Card,
    ogn.charm as Card,
    ogn.clockworkKeeper as Card,
    ogn.defy as Card,
    ogn.enGarde as Card,
    ogn.findYourCenter as Card,
    ogn.meditation as Card,
    ogn.playfulPhantom as Card,
    ogn.runePrison as Card,
    ogn.solariShieldbearer as Card,
    ogn.stalwartPoro as Card,
    ogn.standUnited as Card,
    ogn.sunlitGuardian as Card,
    ogn.wielderOfWater as Card,
    ogn.adaptatron as Card,
    ogn.block as Card,
    ogn.discipline as Card,
    ogn.eclipseHerald as Card,
    ogn.maskOfForesight as Card,
    ogn.poroHerder as Card,
    ogn.reinforce as Card,
    ogn.spiritsRefuge as Card,
    ogn.windWall as Card,
    ogn.wizenedElder as Card,
    ogn.ahriAlluring as Card,
    ogn.blitzcrankImpassive as Card,
    ogn.caitlynPatrolling as Card,
    ogn.lastStand as Card,
    ogn.mageseekerWarden as Card,
    ogn.partyFavors as Card,
    ogn.solariShrine as Card,
    ogn.sonaHarmonious as Card,
    ogn.taricProtector as Card,
    ogn.tastyFaefolk as Card,
    ogn.yasuoRemorseful as Card,
    ogn.zhonyasHourglass as Card,
    ogn.leeSinAscetic as Card,
    ogn.leonaZealot as Card,
    ogn.mysticReversal as Card,
    ogn.sealOfFocus as Card,
    ogn.whiteflameProtector as Card,
    ogn.consultThePast as Card,
    ogn.eagerApprentice as Card,
    ogn.fallingComet as Card,
    ogn.jeweledColossus as Card,
    ogn.lecturingYordle as Card,
    ogn.megaMech as Card,
    ogn.mindRune as Card,
    ogn.orbOfRegret as Card,
    ogn.pitCrew as Card,
    ogn.riptideRex as Card,
    ogn.smokeScreen as Card,
    ogn.spriteCall as Card,
    ogn.stupefy as Card,
    ogn.watchfulSentry as Card,
    ogn.blastconeFae as Card,
    ogn.energyConduit as Card,
    ogn.garbageGrabber as Card,
    ogn.gemcraftSeer as Card,
    ogn.mushroomPouch as Card,
    ogn.portalRescue as Card,
    ogn.ravenbloomStudent as Card,
    ogn.retreat as Card,
    ogn.singularity as Card,
    ogn.spriteMother as Card,
    ogn.avaAchiever as Card,
    ogn.convergentMutation as Card,
    ogn.drMundoExpert as Card,
    ogn.ekkoRecurrent as Card,
    ogn.heimerdingerInventor as Card,
    ogn.kaisaEvolutionary as Card,
    ogn.malzaharFanatic as Card,
    ogn.progressDay as Card,
    ogn.promisingFuture as Card,
    ogn.thousandTailedWatcher as Card,
    ogn.viktorInnovator as Card,
    ogn.wraithOfEchoes as Card,
    ogn.ahriInquisitive as Card,
    ogn.sealOfInsight as Card,
    ogn.teemoStrategist as Card,
    ogn.timeWarp as Card,
    ogn.uncheckedPower as Card,
    ogn.arenaBar as Card,
    ogn.bilgewaterBully as Card,
    ogn.bodyRune as Card,
    ogn.cannonBarrage as Card,
    ogn.challenge as Card,
    ogn.confront as Card,
    ogn.crackshotCorsair as Card,
    ogn.duneDrake as Card,
    ogn.firstMate as Card,
    ogn.flurryOfBlades as Card,
    ogn.mobilize as Card,
    ogn.pakaaCub as Card,
    ogn.pitRookie as Card,
    ogn.stormclawUrsine as Card,
    ogn.catalystOfAeons as Card,
    ogn.cithriaOfCloudfield as Card,
    ogn.heraldOfScales as Card,
    ogn.kinkouMonk as Card,
    ogn.mountainDrake as Card,
    ogn.piratesHaven as Card,
    ogn.spoilsOfWar as Card,
    ogn.unyieldingSpirit as Card,
    ogn.wallop as Card,
    ogn.wildclawShaman as Card,
    ogn.aniviaPrimal as Card,
    ogn.carnivorousSnapvine as Card,
    ogn.krakenHunter as Card,
    ogn.leeSinCentered as Card,
    ogn.mistfall as Card,
    ogn.overtOperation as Card,
    ogn.primalStrength as Card,
    ogn.qiyanaVictorious as Card,
    ogn.sabotage as Card,
    ogn.udyrWildman as Card,
    ogn.volibearImposing as Card,
    ogn.warwickHunter as Card,
    ogn.dazzlingAurora as Card,
    ogn.deadbloomPredator as Card,
    ogn.missFortuneCaptain as Card,
    ogn.sealOfStrength as Card,
    ogn.settBrawler as Card,
    ogn.cemeteryAttendant as Card,
    ogn.chaosRune as Card,
    ogn.emberMonk as Card,
    ogn.fightOrFlight as Card,
    ogn.gust as Card,
    ogn.morbidReturn as Card,
    ogn.mysticPoro as Card,
    ogn.rebuke as Card,
    ogn.rideTheWind as Card,
    ogn.saiScout as Card,
    ogn.shipyardSkulker as Card,
    ogn.sneakyDeckhand as Card,
    ogn.stealthyPursuer as Card,
    ogn.undercoverAgent as Card,
    ogn.acceptableLosses as Card,
    ogn.fadingMemories as Card,
    ogn.packOfWonders as Card,
    ogn.scrapheap as Card,
    ogn.stackedDeck as Card,
    ogn.theSyren as Card,
    ogn.travelingMerchant as Card,
    ogn.treasureTrove as Card,
    ogn.whirlwind as Card,
    ogn.zauniteBouncer as Card,
    ogn.kaynUnleashed as Card,
    ogn.kogmawCaustic as Card,
    ogn.maddenedMarauder as Card,
    ogn.mindsplitter as Card,
    ogn.missFortuneBuccaneer as Card,
    ogn.nocturneHorrifying as Card,
    ogn.rhasaTheSunderer as Card,
    ogn.soulgorger as Card,
    ogn.teemoScout as Card,
    ogn.theHarrowing as Card,
    ogn.tideturner as Card,
    ogn.twistedFateGambler as Card,
    ogn.invertTimelines as Card,
    ogn.jinxRebel as Card,
    ogn.possession as Card,
    ogn.sealOfDiscord as Card,
    ogn.yasuoWindrider as Card,
    ogn.backToBack as Card,
    ogn.callToGlory as Card,
    ogn.cruelPatron as Card,
    ogn.cullTheWeak as Card,
    ogn.daringPoro as Card,
    ogn.faithfulManufactor as Card,
    ogn.forgeOfTheFuture as Card,
    ogn.hiddenBlade as Card,
    ogn.orderRune as Card,
    ogn.pettyOfficer as Card,
    ogn.soaringScout as Card,
    ogn.trifarianGloryseeker as Card,
    ogn.vanguardCaptain as Card,
    ogn.vanguardSergeant as Card,
    ogn.facebreaker as Card,
    ogn.imperialDecree as Card,
    ogn.noxianDrummer as Card,
    ogn.peakGuardian as Card,
    ogn.salvage as Card,
    ogn.solariChief as Card,
    ogn.spectralMatron as Card,
    ogn.symbolOfTheSolari as Card,
    ogn.vanguardHelm as Card,
    ogn.vengeance as Card,
    ogn.albusFerros as Card,
    ogn.commanderLedros as Card,
    ogn.fioraVictorious as Card,
    ogn.grandStrategem as Card,
    ogn.harnessedDragon as Card,
    ogn.karmaChanneler as Card,
    ogn.karthusEternal as Card,
    ogn.kingsEdict as Card,
    ogn.leonaDetermined as Card,
    ogn.machineEvangel as Card,
    ogn.settKingpin as Card,
    ogn.shenKinkou as Card,
    ogn.baitedHook as Card,
    ogn.dariusExecutioner as Card,
    ogn.divineJudgment as Card,
    ogn.sealOfUnity as Card,
    ogn.viktorLeader as Card,
    ogn.daughterOfTheVoid as Card,
    ogn.icathianRain as Card,
    ogn.relentlessStorm as Card,
    ogn.stormbringer as Card,
    ogn.looseCannon as Card,
    ogn.superMegaDeathRocket as Card,
    ogn.handOfNoxus as Card,
    ogn.noxianGuillotine as Card,
    ogn.nineTailedFox as Card,
    ogn.foxFire as Card,
    ogn.blindMonk as Card,
    ogn.dragonsRage as Card,
    ogn.unforgiven as Card,
    ogn.lastBreath as Card,
    ogn.radiantDawn as Card,
    ogn.zenithBlade as Card,
    ogn.swiftScout as Card,
    ogn.guerillaWarfare as Card,
    ogn.heraldOfTheArcane as Card,
    ogn.siphonPower as Card,
    ogn.bountyHunter as Card,
    ogn.bulletTime as Card,
    ogn.theBoss as Card,
    ogn.showstopper as Card,
    ogn.recruitDe as Card,
    ogn.recruitNx as Card,
    ogn.recruitZn as Card,
    ogn.sprite as Card,
    ogn.altarToUnity as Card,
    ogn.aspirantsClimb as Card,
    ogn.backAlleyBar as Card,
    ogn.bandleTree as Card,
    ogn.fortifiedPosition as Card,
    ogn.groveOfTheGodWillow as Card,
    ogn.hallowedTomb as Card,
    ogn.monasteryOfHirana as Card,
    ogn.navoriFightingPit as Card,
    ogn.obeliskOfPower as Card,
    ogn.reaversRow as Card,
    ogn.reckonersArena as Card,
    ogn.sigilOfTheStorm as Card,
    ogn.startippedPeak as Card,
    ogn.targonsPeak as Card,
    ogn.theArenasGreatest as Card,
    ogn.theCandlelitSanctum as Card,
    ogn.theDreamingTree as Card,
    ogn.theGrandPlaza as Card,
    ogn.trifarianWarCamp as Card,
    ogn.vilemawsLair as Card,
    ogn.voidGate as Card,
    ogn.windsweptHillock as Card,
    ogn.zaunWarrens as Card,
    ogs.annieFiery as Card,
    ogs.firestorm as Card,
    ogs.incinerate as Card,
    ogs.yiMeditative as Card,
    ogs.zephyrSage as Card,
    ogs.luxIlluminated as Card,
    ogs.garenRugged as Card,
    ogs.gentlemensDuel as Card,
    ogs.yiHoned as Card,
    ogs.annieStubborn as Card,
    ogs.flash as Card,
    ogs.blastOfPower as Card,
    ogs.garenCommander as Card,
    ogs.luxCrownguard as Card,
    ogs.recruitTheVanguard as Card,
    ogs.vanguardAttendant as Card,
    ogs.darkChildStarter as Card,
    ogs.tibbers as Card,
    ogs.wujuBladesmanStarter as Card,
    ogs.highlander as Card,
    ogs.ladyOfLuminosityStarter as Card,
    ogs.finalSpark as Card,
    ogs.mightOfDemaciaStarter as Card,
    ogs.decisiveStrike as Card,
    sfd.againstTheOdds as Card,
    sfd.armedAssailant as Card,
    sfd.bloodRush as Card,
    sfd.gold as Card,
    sfd.bushwhack as Card,
    sfd.detonate as Card,
    sfd.eagerDrakehound as Card,
    sfd.gemJammer as Card,
    sfd.sentinelAdept as Card,
    sfd.serratedDirk as Card,
    sfd.voidDrone as Card,
    sfd.angleShot as Card,
    sfd.batteringRam as Card,
    sfd.blastCorpsCadet as Card,
    sfd.minotaurReckoner as Card,
    sfd.perchedGrimwyrm as Card,
    sfd.recurveBow as Card,
    sfd.suddenStorm as Card,
    sfd.voidHatchling as Card,
    sfd.assemblyRig as Card,
    sfd.dravenVanquisher as Card,
    sfd.ferrousForerunner as Card,
    sfd.longSword as Card,
    sfd.piercingLight as Card,
    sfd.rellMagnetic as Card,
    sfd.rengarPouncing as Card,
    sfd.rumbleHotheaded as Card,
    sfd.dunebreaker as Card,
    sfd.lucianGunslinger as Card,
    sfd.reksaiBreacher as Card,
    sfd.skyfallOfAreion as Card,
    sfd.desertsCall as Card,
    sfd.disarmingRake as Card,
    sfd.doransShield as Card,
    sfd.feralStrength as Card,
    sfd.guardianOfThePassage as Card,
    sfd.lonelyPoro as Card,
    sfd.navoriScout as Card,
    sfd.ribbonDancer as Card,
    sfd.royalEntourage as Card,
    sfd.thwonk as Card,
    sfd.apprenticeSmith as Card,
    sfd.brutalizer as Card,
    sfd.emperorsDivide as Card,
    sfd.legionQuartermaster as Card,
    sfd.notSoFast as Card,
    sfd.poroSnax as Card,
    sfd.simianAncestor as Card,
    sfd.stellacornHerder as Card,
    sfd.apheliosExalted as Card,
    sfd.azirAscendant as Card,
    sfd.guardianAngel as Card,
    sfd.heartOfDarkIce as Card,
    sfd.jannaSavior as Card,
    sfd.jaxUnmatched as Card,
    sfd.needlesslyLargeYordle as Card,
    sfd.steraksGage as Card,
    sfd.ireliaFervent as Card,
    sfd.ornnBlacksmith as Card,
    sfd.svellsongur as Card,
    sfd.tiannaCrownguard as Card,
    sfd.aspiringEngineer as Card,
    sfd.bubbleBot as Card,
    sfd.chemtechCask as Card,
    sfd.clothArmor as Card,
    sfd.forecaster as Card,
    sfd.frigidTouch as Card,
    sfd.frostcoatCub as Card,
    sfd.gearhead as Card,
    sfd.plunderingPoro as Card,
    sfd.wagesOfPain as Card,
    sfd.breakneckMech as Card,
    sfd.dropboarder as Card,
    sfd.experimentalHexplate as Card,
    sfd.pickpocket as Card,
    sfd.prizeOfProgress as Card,
    sfd.productionSurge as Card,
    sfd.rocketBarrage as Card,
    sfd.temporalPortal as Card,
    sfd.bardMercurial as Card,
    sfd.bellowsBreath as Card,
    sfd.cardSharp as Card,
    sfd.ezrealDashing as Card,
    sfd.hextechAnomaly as Card,
    sfd.jayceManOfProgress as Card,
    sfd.ornnForgeGod as Card,
    sfd.worldAtlas as Card,
    sfd.premonition as Card,
    sfd.renataGlascMastermind as Card,
    sfd.rumbleScrapper as Card,
    sfd.theZeroDrive as Card,
    sfd.buhruCaptain as Card,
    sfd.combatChef as Card,
    sfd.dauntlessVanguard as Card,
    sfd.direwing as Card,
    sfd.doransBlade as Card,
    sfd.laurentBladekeeper as Card,
    sfd.punchFirst as Card,
    sfd.seaMonkey as Card,
    sfd.veteranPoro as Card,
    sfd.yordleExplorer as Card,
    sfd.faeDragon as Card,
    sfd.hexdrinker as Card,
    sfd.jaullFish as Card,
    sfd.petriciteMonument as Card,
    sfd.ruinRunner as Card,
    sfd.showOfStrength as Card,
    sfd.strikeDown as Card,
    sfd.warmogsArmor as Card,
    sfd.akshanMischievous as Card,
    sfd.fioraPeerless as Card,
    sfd.hereToHelp as Card,
    sfd.katoTheArm as Card,
    sfd.lucianMerciless as Card,
    sfd.marchingOrders as Card,
    sfd.trinityForce as Card,
    sfd.yoneBlademaster as Card,
    sfd.ancientHenge as Card,
    sfd.boneshiver as Card,
    sfd.jaxUnrelenting as Card,
    sfd.sivirAmbitious as Card,
    sfd.blackMarketBroker as Card,
    sfd.calledShot as Card,
    sfd.corruptEnforcer as Card,
    sfd.doransRing as Card,
    sfd.faePorter as Card,
    sfd.loyalPup as Card,
    sfd.masterBingwen as Card,
    sfd.overzealousFan as Card,
    sfd.temptation as Card,
    sfd.treasureHunter as Card,
    sfd.ancientWarmonger as Card,
    sfd.beastBelow as Card,
    sfd.bootsOfSwiftness as Card,
    sfd.cull as Card,
    sfd.factoryRecall as Card,
    sfd.hardBargain as Card,
    sfd.harpoonSquad as Card,
    sfd.windsinger as Card,
    sfd.edgeOfNight as Card,
    sfd.fizzTrickster as Card,
    sfd.ireliaGraceful as Card,
    sfd.jaeMedarda as Card,
    sfd.sivirMercenary as Card,
    sfd.spiritWheel as Card,
    sfd.switcheroo as Card,
    sfd.vexCheerless as Card,
    sfd.downwell as Card,
    sfd.dravenAudacious as Card,
    sfd.ezrealProdigy as Card,
    sfd.lastRites as Card,
    sfd.bondsOfStrength as Card,
    sfd.eminentBenefactor as Card,
    sfd.eyeOfTheHerald as Card,
    sfd.guards as Card,
    sfd.honestBroker as Card,
    sfd.laurentDuelist as Card,
    sfd.royalGuard as Card,
    sfd.sandshifter as Card,
    sfd.trustyRamhound as Card,
    sfd.zaunPunk as Card,
    sfd.bFSword as Card,
    sfd.bloodMoney as Card,
    sfd.deathgrip as Card,
    sfd.dragUnder as Card,
    sfd.glascMixologist as Card,
    sfd.rallyTheTroops as Card,
    sfd.unsungHero as Card,
    sfd.vanguardArmory as Card,
    sfd.altarOfMemories as Card,
    sfd.reksaiSwarmQueen as Card,
    sfd.renataGlascIndustrialist as Card,
    sfd.sacredShears as Card,
    sfd.sorakaWanderer as Card,
    sfd.troveGolem as Card,
    sfd.undertitan as Card,
    sfd.xinZhaoVigilant as Card,
    sfd.azirSovereign as Card,
    sfd.bladeOfTheRuinedKing as Card,
    sfd.corinaVeraza as Card,
    sfd.fioraWorthy as Card,
    sfd.mechanizedMenace as Card,
    sfd.dangerZone as Card,
    sfd.purifier as Card,
    sfd.relentlessPursuit as Card,
    sfd.gloriousExecutioner as Card,
    sfd.spinningAxe as Card,
    sfd.voidBurrower as Card,
    sfd.voidRush as Card,
    sfd.fireBelowTheMountain as Card,
    sfd.forgefireCape as Card,
    sfd.rabadonsDeathcrown as Card,
    sfd.shurelyasRequiem as Card,
    sfd.grandmasterAtArms as Card,
    sfd.counterStrike as Card,
    sfd.bladeDancer as Card,
    sfd.defiantDance as Card,
    sfd.emperorOfTheSands as Card,
    sfd.arise as Card,
    sfd.prodigalExplorer as Card,
    sfd.arcaneShift as Card,
    sfd.chemBaroness as Card,
    sfd.hostileTakeover as Card,
    sfd.battleMistress as Card,
    sfd.onTheHunt as Card,
    sfd.grandDuelist as Card,
    sfd.riposte as Card,
    sfd.emperorsDais as Card,
    sfd.forgeOfTheFluft as Card,
    sfd.forgottenMonument as Card,
    sfd.hallOfLegends as Card,
    sfd.maraiSpire as Card,
    sfd.minefield as Card,
    sfd.ornnsForge as Card,
    sfd.powerNexus as Card,
    sfd.ravenbloomConservatory as Card,
    sfd.rockfallPath as Card,
    sfd.seatOfPower as Card,
    sfd.sunkenTemple as Card,
    sfd.thePapertree as Card,
    sfd.treasureHoard as Card,
    sfd.veiledTemple as Card,
    unl.arenaKingpin as Card,
    unl.baronPit as Card,
    unl.bird as Card,
    unl.inferna as Card,
    unl.brush as Card,
    unl.mischievousMarai as Card,
    unl.preparedNeophyte as Card,
    unl.gold as Card,
    unl.revnaTheLorekeeper as Card,
    unl.reflection as Card,
    unl.sharkling as Card,
    unl.smite as Card,
    unl.sprite as Card,
    unl.toweringPairofant as Card,
    unl.upstageComedy as Card,
    unl.vaultBreaker as Card,
    unl.freshBeans as Card,
    unl.lordBroadmane as Card,
    unl.lotusTrap as Card,
    unl.monsterHarpoon as Card,
    unl.rightOfConquest as Card,
    unl.scorchclaw as Card,
    unl.squareUp as Card,
    unl.yetiBrawler as Card,
    unl.blightedBattleaxe as Card,
    unl.dancingGrenade as Card,
    unl.grimApothecary as Card,
    unl.jhinMurderousArtist as Card,
    unl.katarinaReckless as Card,
    unl.rengarUnseen as Card,
    unl.undyingLegion as Card,
    unl.xerathFreed as Card,
    unl.inviolusVox as Card,
    unl.pykeDocksideButcher as Card,
    unl.redBrambleback as Card,
    unl.viHotheaded as Card,
    unl.combatExperience as Card,
    unl.doubleTrouble as Card,
    unl.friskyHunter as Card,
    unl.heraldOfSpring as Card,
    unl.monch as Card,
    unl.mutatedMouser as Card,
    unl.shadowWatcher as Card,
    unl.skywardStrike as Card,
    unl.soulSword as Card,
    unl.wujuApprentice as Card,
    unl.allayEagerAdmirer as Card,
    unl.backOff as Card,
    unl.enthusiasticPromoter as Card,
    unl.flurryOfFeathers as Card,
    unl.forgottenSignpost as Card,
    unl.friendship as Card,
    unl.mosstomper as Card,
    unl.trevorSnoozebottom as Card,
    unl.honeyfruit as Card,
    unl.iascylla as Card,
    unl.ivernNurturer as Card,
    unl.namiHeadstrong as Card,
    unl.scuttleCrab as Card,
    unl.tricksyTentacles as Card,
    unl.vexMocking as Card,
    unl.yuumiMagicalCat as Card,
    unl.alphaWildclaw as Card,
    unl.lilliaProtectorOfDreams as Card,
    unl.masterYiUnstoppable as Card,
    unl.vilemaw as Card,
    unl.downstageDramatics as Card,
    unl.dramaticVisionary as Card,
    unl.eclipse as Card,
    unl.fateWeaver as Card,
    unl.icevaleArcher as Card,
    unl.moonlightAffliction as Card,
    unl.ruinedRex as Card,
    unl.spectralCentaur as Card,
    unl.spriteBurst as Card,
    unl.turnToDust as Card,
    unl.chakramDancer as Card,
    unl.crescentStrike as Card,
    unl.deadlyFlourish as Card,
    unl.frigidJewel as Card,
    unl.gustwalker as Card,
    unl.petalPixie as Card,
    unl.soulShepherd as Card,
    unl.spriteFountain as Card,
    unl.dianaLunari as Card,
    unl.hweiBroodingPainter as Card,
    unl.keeperOfMasks as Card,
    unl.lilliaFaeFawn as Card,
    unl.smokeAndMirrors as Card,
    unl.spriteQueen as Card,
    unl.sumpworksMap as Card,
    unl.zileanTimeMage as Card,
    unl.blueSentinel as Card,
    unl.gutterPalace as Card,
    unl.jhinMeticulousKiller as Card,
    unl.leblancEverywhereAtOnce as Card,
    unl.concentrate as Card,
    unl.demacianDiplomat as Card,
    unl.dragonsoulSage as Card,
    unl.gemhandHunter as Card,
    unl.grimResolve as Card,
    unl.huntersMachete as Card,
    unl.kinkouInitiate as Card,
    unl.targonianVisionary as Card,
    unl.toweringCombatant as Card,
    unl.voraciousGromp as Card,
    unl.callToBattle as Card,
    unl.crowdFavorite as Card,
    unl.disposalOrder as Card,
    unl.gentleGemdragon as Card,
    unl.imposingChallenger as Card,
    unl.repulse as Card,
    unl.stareDown as Card,
    unl.wilyNewtfish as Card,
    unl.bloodRose as Card,
    unl.clashOfGiants as Card,
    unl.determinedSentry as Card,
    unl.irresistibleFaefolk as Card,
    unl.masterYiTempered as Card,
    unl.nidaleeCatForm as Card,
    unl.nilahJoyfulAscetic as Card,
    unl.poppyParagon as Card,
    unl.arachnoidHorror as Card,
    unl.elderDragon as Card,
    unl.khazixEvolvingHunter as Card,
    unl.rengarTrophyHunter as Card,
    unl.bewitchingSpirit as Card,
    unl.crescentGuardian as Card,
    unl.evershadeStalker as Card,
    unl.isolate as Card,
    unl.lunarBoon as Card,
    unl.megatusk as Card,
    unl.misterRoot as Card,
    unl.starCrossed as Card,
    unl.viciousSnapjaws as Card,
    unl.walkingRoost as Card,
    unl.abandon as Card,
    unl.anglerBeast as Card,
    unl.blastCone as Card,
    unl.existentialDread as Card,
    unl.insightfulInvestigator as Card,
    unl.scryersBloom as Card,
    unl.sinisterPoro as Card,
    unl.theList as Card,
    unl.boneSkewer as Card,
    unl.conscription as Card,
    unl.evelynnEntrancing as Card,
    unl.heedlessResurrection as Card,
    unl.khazixMutatingHorror as Card,
    unl.maduliTheGatekeeper as Card,
    unl.pykeReturned as Card,
    unl.syndraTranscendent as Card,
    unl.baronNashor as Card,
    unl.cursedSarcophagus as Card,
    unl.dianaNoLongerHuman as Card,
    unl.vexApathetic as Card,
    unl.bandleSoldier as Card,
    unl.blackRoseDignitary as Card,
    unl.carrionDredger as Card,
    unl.crimsonPigeons as Card,
    unl.heroicCharge as Card,
    unl.loyalPoro as Card,
    unl.scrutinizingSergeant as Card,
    unl.shepherdsHeirloom as Card,
    unl.soulHarvest as Card,
    unl.ultrasoftPoro as Card,
    unl.diviningShells as Card,
    unl.enthrallingProtector as Card,
    unl.mageseekerInvestigator as Card,
    unl.safetyInspector as Card,
    unl.shadowsCall as Card,
    unl.stalkingWolf as Card,
    unl.starhound as Card,
    unl.undyingLoyalty as Card,
    unl.asheFocused as Card,
    unl.atakhan as Card,
    unl.galioIndefatigable as Card,
    unl.leblancFragmented as Card,
    unl.sacrifice as Card,
    unl.shardOfUndoing as Card,
    unl.tacticalRetreat as Card,
    unl.viPeacekeeper as Card,
    unl.ivernFriendToAll as Card,
    unl.poppyDefenderOfTheMeek as Card,
    unl.riftHerald as Card,
    unl.theRuination as Card,
    unl.virtuoso as Card,
    unl.curtainCall as Card,
    unl.pridestalker as Card,
    unl.thrillOfTheHunt as Card,
    unl.bloodharborRipper as Card,
    unl.deathFromBelow as Card,
    unl.piltoverEnforcer as Card,
    unl.hextechGauntlets as Card,
    unl.bashfulBloom as Card,
    unl.liltingLullaby as Card,
    unl.wujuMaster as Card,
    unl.alphaStrike as Card,
    unl.gloomist as Card,
    unl.shadow as Card,
    unl.greenFather as Card,
    unl.daisy as Card,
    unl.scornOfTheMoon as Card,
    unl.moonfall as Card,
    unl.deceiver as Card,
    unl.mirrorImage as Card,
    unl.voidreaver as Card,
    unl.voidAssault as Card,
    unl.keeperOfTheHammer as Card,
    unl.keepersVerdict as Card,
    unl.abandonedHall as Card,
    unl.altarOfBlood as Card,
    unl.amateurRecital as Card,
    unl.blackFlameAltar as Card,
    unl.duskRoseLab as Card,
    unl.forbiddingWaste as Card,
    unl.forgottenLibrary as Card,
    unl.frozenFortress as Card,
    unl.gardensOfBecoming as Card,
    unl.rippersBay as Card,
    unl.starSpring as Card,
    unl.theAcademy as Card,
    unl.trappingGrounds as Card,
    unl.valleyOfIdols as Card,
    unl.vaultsOfHelia as Card,
  ];
}

/**
 * Adapt a set-JSON card (from generate-set-json.ts output) into the Card shape
 * used by the typed .ts definitions. Lets sets without hand-authored .ts files
 * (currently VEN) flow into getAllCards() and the engine's card registry.
 */
/**
 * Engine-primitive markers for set-JSON cards. The generator cannot infer
 * these from rules text, and VEN has no hand-authored .ts file to carry them.
 */
const JSON_CARD_ENGINE_FLAGS: Record<string, Record<string, unknown>> = {
  // rule 766 / 767 — Dune Surfer: "You ignore [Tank] while assigning combat
  // damage here." The generator emits `abilities: []` and the rules-text parser
  // has no "ignore <keyword>" shape, so the static is declared here. Only the
  // controller's assignment, and only at the battlefield the Surfer is at —
  // both scoped by the reader in resolve-full-combat.ts.
  "ven-004-166": {
    abilities: [{ effect: { keyword: "Tank", type: "ignore-keyword" }, type: "static" }],
  },
  // rule 363 / 356.3 / 811.6 — Mystic Vortex: "During showdowns here, cards with
  // [Reaction] cost [rainbow] more to play." The generator emits `abilities: []`.
  // It names no "you", so the audience is EVERY player's cards (`controller:
  // "any"`), and the scope is the showdown's location, not the played card's —
  // hence a plain `while-in-showdown` condition on the battlefield itself.
  // Hidden cards have [Reaction] (811.6) and a cost increase survives "ignoring
  // its base cost" (356.1.b.3), so flipping a facedown card is no longer free.
  "ven-160-166": {
    abilities: [
      {
        condition: { type: "while-in-showdown" },
        effect: {
          amount: { power: ["rainbow"] },
          scope: "play",
          target: { controller: "any", keyword: "Reaction" },
          type: "cost-increase",
        },
        type: "static",
      },
    ],
  },
  // rule 828.1.d / 419.3 / 206 — Tail-Cloaked Matriarch: "[Empower] [2][chaos] /
  // When I become [Empowered], you may choose a unit in your trash with Energy
  // cost no more than [3] and Power cost no more than [rainbow]. Play it to your
  // base, ignoring its cost." The parser derives the [Empower] activation but
  // emits line 2 as a spell-shaped play with a pending value — the trash source
  // and both printed-cost caps are lost — so both lines are declared here. Same
  // primitive as Spectral Matron (ogn-226-298): a `from: "trash"` play with
  // `ignoreCost: true` and two independent inclusive bounds.
  "ven-104-166": {
    abilities: [
      {
        cost: { energy: 2, power: ["chaos"] },
        effect: { target: "self", type: "empower" },
        restrictions: [{ type: "not-empowered" }],
        type: "activated",
      },
      {
        effect: {
          // rule 402.1 / 355.10 — the printed "you may" governs the whole
          // instruction ("you may CHOOSE a unit … Play it"), so finalization
          // asks a plain yes/no and the trash pick waits for resolution;
          // rule 355.2: "to your base" pins the destination, so no location
          // is ever offered.
          chooseAtResolution: true,
          from: "trash",
          ignoreCost: true,
          target: {
            controller: "friendly",
            filter: [{ energyCost: { lte: 3 } }, { powerCost: { lte: 1 } }],
            type: "unit",
          },
          toLocation: "base",
          type: "play",
        },
        optional: true,
        trigger: { event: "empower", on: "self" },
        type: "triggered",
      },
    ],
  },
  // rule 359.3.e / 356.4.b / 317.2.c — Jayce, Man of Progress (VEN reprint of
  // sfd-084-221 minus the reminder text): "When you play me, you may kill a
  // friendly gear. If you do, you may play a gear with Energy cost no more than
  // [7] from hand this turn, ignoring its Energy cost." The parser derives only
  // the optional kill and drops the "If you do" rider, so the linked permission
  // is declared here exactly as the SFD .ts definition carries it: a single-fire
  // `play-cost` replacement that waives Energy (never Power) for one gear whose
  // printed Energy cost is at most 7, swept at end of turn if unused.
  "ven-175-166": {
    abilities: [
      {
        effect: {
          effects: [
            { target: { controller: "friendly", type: "gear" }, type: "kill" },
            {
              condition: { type: "paid-additional-cost" },
              then: {
                duration: "next",
                ignoreEnergyCost: true,
                maxEnergyCost: 7,
                replaces: "play-cost",
                target: { controller: "friendly", type: "gear" },
                type: "replacement",
              },
              type: "conditional",
            },
          ],
          type: "sequence",
        },
        optional: true,
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ],
  },
  // rule 135.2 / 416.1.a — Decree of Strength: "Choose an opponent. They reveal
  // their hand and you choose a Mind card from it. They recycle that card."
  // Same primitive as Sabotage (ogn-156-298) but the pick filter is a DOMAIN,
  // not a card type: Mind units, spells and gear all qualify, and a two-domain
  // card counts when either domain is Mind.
  "ven-085-166": {
    abilities: [
      {
        effect: {
          filter: { domains: ["mind"] },
          onPicked: "recycle",
          target: { type: "player", which: "opponent" },
          type: "reveal-hand",
        },
        type: "spell",
      },
    ],
  },
  // rule 415.1 / 807 / 809 / 810 — Jayce, Hammer in Hand: "When I become ready,
  // choose one to give me this turn — [Assault 2] / [Deflect 2] / [Ganking]".
  // The generator's parse keeps the trigger but leaves the modal body as `raw`
  // and bolts the two reminder-text keywords on as PRINTED keywords; Jayce has
  // none printed — each is a turn-scoped grant chosen on resolution (rule 359.3).
  "ven-088-166": {
    abilities: [
      {
        effect: {
          options: [
            {
              effect: { duration: "turn", keyword: "Assault", type: "grant-keyword", value: 2 },
              label: "Assault 2",
            },
            {
              effect: { duration: "turn", keyword: "Deflect", type: "grant-keyword", value: 2 },
              label: "Deflect 2",
            },
            {
              effect: { duration: "turn", keyword: "Ganking", type: "grant-keyword" },
              label: "Ganking",
            },
          ],
          type: "choice",
        },
        trigger: { event: "ready", on: "self" },
        type: "triggered",
      },
    ],
  },
  // rule 440.1 / 440.1.a — Forgotten Relic: "When you play this or at the start of
  // your Beginning Phase, [Burn 1]. When you burn a unit this way, do this: Give a
  // friendly unit +[Might] equal to the burned card's Might this turn." The parser
  // gets the burn but drops the reflexive follow-up, so both halves are declared
  // here: `then` on the mill runs once per burned UNIT with `burnedMight` bound to
  // that card's printed Might (handle_mill), and the recipient is chosen at
  // resolution by the Relic's controller.
  "ven-108-166": {
    abilities: [
      {
        effect: {
          amount: 1,
          player: "self",
          then: {
            amount: { variable: "burnedMight" },
            chooseTarget: true,
            duration: "turn",
            target: { controller: "friendly", type: "unit" },
            type: "modify-might",
          },
          type: "mill",
        },
        trigger: { event: "play-self-or-beginning-phase", on: "self" },
        type: "triggered",
      },
    ],
  },
  // rule 383.2.a.1 / 383.3.b — Gust Monk: "You may pay [1] as an additional cost
  // to play me. When you play me, if you paid the additional cost, banish a card
  // from any trash to give a unit [Assault 2] this turn." The parser leaves the
  // trigger's effect as `raw`, so it is declared here: the banish is a COST
  // within instructions (`costStep`) paid from ANY trash (rule 355.8 —
  // `controller: "any"` widens the off-board pool to both players, and the card
  // lands in its OWNER's banishment), and it always asks its controller even
  // with a single candidate. Unpayable ⇒ no Assault, even though [1] was paid.
  "ven-101-166": {
    abilities: [
      {
        effect: { additionalCost: ":rb_energy_1:", optional: true, type: "additional-cost-option" },
        type: "static",
      },
      {
        condition: { type: "paid-additional-cost" },
        effect: {
          effects: [
            {
              costStep: true,
              target: {
                controller: "any",
                location: "trash",
                promptWhenSingle: true,
                type: "card",
              },
              type: "banish",
            },
            // rule 807.2 — a granted [Assault 2] sums with printed Assault and
            // only adds Might while the unit is an attacker.
            {
              duration: "turn",
              keyword: "Assault",
              target: { type: "unit" },
              type: "grant-keyword",
              value: 2,
            },
          ],
          type: "sequence",
        },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ],
  },
  // rule 383.2.a.1 / 442.1 — Tomb-Raider Barbara: "When you play me, if you
  // control 7 or more runes, choose an enemy gear. If it's [Empowered],
  // disempower it. Otherwise, kill it." The rune rider sits inside the trigger
  // condition (below 7 runes nothing reaches the chain); the branch is decided
  // at resolution from the CHOSEN gear's status, so the conditional carries the
  // caster-chosen target and the branches carry none. The parser leaves the
  // whole clause as a `raw` no-op, so it is declared here.
  "ven-037-166": {
    abilities: [
      {
        condition: { amount: 7, type: "runes-at-least" },
        effect: {
          condition: { type: "target-empowered" },
          else: { type: "kill" },
          target: { controller: "enemy", type: "gear" },
          then: { type: "disempower" },
          type: "conditional",
        },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ],
  },
  // rule 442.1 / 355.8 — Guttural Roar: "Give a unit +2 [Might] this turn. If
  // it's [Empowered], give it +4 [Might] this turn instead." The "instead"
  // replaces the +2 rather than stacking with it, and the branch is decided from
  // the CHOSEN unit's status at resolution, so the conditional carries the
  // caster-chosen target and the branches carry none. The parser keeps only the
  // flat +2, so both tiers are declared here.
  // rule 208.1 — Fretful Feline: "When I become ready, give me +2 [Might] this
  // turn." "me" is self-bound, but the set-JSON generator emitted a chooseable
  // `target: {type:"unit"}`, which makes the resolver prompt for any unit on the
  // board (and lets the bonus land on an ally). Declare the self target here.
  "ven-071-166": {
    abilities: [
      {
        effect: { amount: 2, duration: "turn", target: "self", type: "modify-might" },
        optional: false,
        trigger: { event: "ready", on: "self" },
        type: "triggered",
      },
    ],
  },
  "ven-072-166": {
    abilities: [
      {
        effect: {
          condition: { type: "target-empowered" },
          else: { amount: 2, duration: "turn", type: "modify-might" },
          target: { type: "unit" },
          then: { amount: 4, duration: "turn", type: "modify-might" },
          type: "conditional",
        },
        timing: "action",
        type: "spell",
      },
    ],
  },
  // rule 442.1 — Rage Amplifier: "Your units have +1 [Might]. If I'm
  // [Empowered], they have +2 [Might] instead." One continuous static over the
  // controller's units whose amount is REPLACED (not stacked) while the
  // Amplifier itself is Empowered, so the tier rides on the effect as
  // `empoweredAmount` (read in static-abilities.ts applyStaticEffect) rather
  // than as two mutually exclusive statics. The parser drops the whole line.
  "ven-018-166": {
    abilities: [
      {
        cost: { energy: 6, power: ["fury"] },
        effect: { target: "self", type: "empower" },
        restrictions: [{ type: "not-empowered" }],
        type: "activated",
      },
      {
        effect: {
          amount: 1,
          empoweredAmount: 2,
          target: { controller: "friendly", type: "unit" },
          type: "modify-might",
        },
        type: "static",
      },
    ],
  },
  // rule 356.3 — Helm of Suppression: "Opponents' spells cost [1] more. If this
  // is [Empowered], they cost [1][rainbow] more instead." The parser has no
  // "instead" cost-increase shape, so both tiers are declared here as mutually
  // exclusive statics (each Helm is its own static, so copies stack).
  "ven-045-166": {
    abilities: [
      {
        cost: { energy: 4, power: ["calm"] },
        effect: { target: "self", type: "empower" },
        restrictions: [{ type: "not-empowered" }],
        type: "activated",
      },
      {
        condition: { condition: { type: "while-empowered" }, type: "not" },
        effect: { by: 1, target: { controller: "enemy", type: "spell" }, type: "cost-increase" },
        type: "static",
      },
      {
        condition: { type: "while-empowered" },
        effect: {
          by: ":rb_energy_1::rb_rune_rainbow:",
          target: { controller: "enemy", type: "spell" },
          type: "cost-increase",
        },
        type: "static",
      },
    ],
  },
  // rule 441.1.c.1 / 827.1 — Kayle, Justified: four printed lines, of which the
  // parser only shapes the first. "I can be [Empowered] up to three times" is a
  // permission that replaces the implicit "only if not Empowered" gate with an
  // `empower-limit` (activate-ability.ts empowerActivationBlocked); the Might
  // line scales off the empower COUNT (zero times is +0); the keyword line is a
  // tier that turns on at exactly three (`while-empowered` with `times`).
  "ven-134-166": {
    abilities: [
      {
        cost: { energy: 3 },
        effect: { target: "self", type: "empower" },
        restrictions: [{ max: 3, type: "empower-limit" }],
        type: "activated",
      },
      {
        effect: { max: 3, target: "self", type: "empower-permission" },
        type: "static",
      },
      {
        effect: {
          amount: { empowerCount: true, multiplier: 2 },
          target: "self",
          type: "modify-might",
        },
        type: "static",
      },
      {
        condition: { times: 3, type: "while-empowered" },
        effect: {
          effects: [
            { keyword: "Deflect", target: { type: "self" }, type: "grant-keyword", value: 3 },
            { keyword: "Ganking", target: { type: "self" }, type: "grant-keyword" },
          ],
          type: "sequence",
        },
        type: "static",
      },
    ],
  },
  // rule 827.1.c.2 — Legion Marauder: "[Empower] — [1] or [body]". The parser
  // has no either/or activation-cost shape, so the two complete costs are
  // declared as `costOptions` (exactly one of them is paid; see
  // activate-ability.ts selectCostOption) alongside the [Empowered] +1 static.
  "ven-074-166": {
    abilities: [
      {
        cost: {},
        costOptions: [{ energy: 1 }, { power: ["body"] }],
        effect: { target: "self", type: "empower" },
        restrictions: [{ type: "not-empowered" }],
        type: "activated",
      },
      {
        condition: { type: "while-empowered" },
        effect: { amount: 1, target: { type: "unit" }, type: "modify-might" },
        type: "static",
      },
    ],
  },
  // rule 419.4 / 187.2 — Jayce, Brilliant Inventor: "When you play me or the
  // first time you play a non-token gear each turn, you may ready something
  // besides me that's exhausted." The generator emits `abilities: []`, and the
  // rules-text parser leaves the effect clause as a `raw` no-op. Two triggers:
  // the play-self half is unrestricted, the gear half is once per turn and
  // ignores tokens.
  "ven-068a-166": {
    abilities: [
      {
        effect: {
          target: { excludeSelf: true, filter: "exhausted", type: "permanent" },
          type: "ready",
        },
        optional: true,
        trigger: { event: "play-self", on: "self" },
        type: "triggered",
      },
      {
        effect: {
          target: { excludeSelf: true, filter: "exhausted", type: "permanent" },
          type: "ready",
        },
        optional: true,
        trigger: {
          event: "play-gear",
          on: { cardType: "gear", controller: "friendly" },
          restrictions: [{ type: "first-time-each-turn" }, { type: "non-token" }],
        },
        type: "triggered",
      },
    ],
  },
  // rule 424 / 403 — Pakaa Protector: "When I move, reveal the top card of your
  // Main Deck. If it's a unit, draw it. Otherwise, put it in your trash and give
  // me +2 [Might] this turn." The generator emits `abilities: [null]` and the
  // rules-text parser leaves the effect as a `raw` no-op. Same bounded-reveal
  // shape as sfd-041-221 Apprentice Smith, with the miss trashed (not recycled)
  // and a miss-only Might rider.
  "ven-033-166": {
    abilities: [
      {
        effect: {
          amount: 1,
          from: "deck",
          then: {
            draw: 1,
            otherwise: { amount: 2, duration: "turn", target: "self", type: "modify-might" },
            trash: "rest",
          },
          type: "reveal",
          until: "unit",
        },
        trigger: { event: "move", on: "self" },
        type: "triggered",
      },
    ],
  },
  // rule 356.4.c — Ezreal, Prodigy (VEN promo printing of sfd-149-221, same
  // text): the rules-text parser produces only the play-self trigger, dropping
  // "Optional additional costs you pay cost [1] or [rainbow] less". Mirrors the
  // hand-authored sfd definition.
  "ven-sp5-006": {
    abilities: [
      {
        effect: {
          effects: [
            { amount: 1, type: "discard" },
            { amount: 2, type: "draw" },
          ],
          type: "sequence",
        },
        trigger: { event: "play-self" },
        type: "triggered",
      },
      {
        effect: {
          alternative: { power: ["rainbow"] },
          by: { energy: 1 },
          target: "optional additional costs you pay",
          type: "cost-reduction",
        },
        type: "static",
      },
    ],
  },
  // rule 477.1.b — "The equipped unit becomes a copy of that unit for as long
  // as this is attached to it." (Shady Spectacles)
  "ven-137-166": { copyChosenUnitToHolder: true },
  // rule 366-372 / 433.1.b — Gangplank, Naval: "[Empowered] If a spell or
  // ability that chooses me would stun me, give me -[Might], or return me to
  // hand, give me +3 [Might] instead." Only the -Might half is modelled today;
  // the stun / return-to-hand halves need their own replacement events.
  // rule 355.4 / 387 — Shadow Dash: "Move an enemy unit to a battlefield where
  // you have units. If you have exactly two units there, they each get +1
  // [Might] this turn." The generator emits `abilities: [null]`; the destination
  // is a presence-filtered battlefield choice and the rider is anchored at that
  // destination, neither of which the rules-text parser can express.
  "ven-148-166": {
    abilities: [
      {
        effect: {
          target: { controller: "enemy", type: "unit" },
          then: {
            condition: {
              comparison: { eq: 2 },
              target: { controller: "friendly", location: "same", quantity: "all", type: "unit" },
              type: "count",
            },
            then: {
              amount: 1,
              duration: "turn",
              target: {
                controller: "friendly",
                excludeBound: true,
                location: "same",
                quantity: "all",
                type: "unit",
              },
              type: "modify-might",
            },
            type: "conditional",
          },
          to: { battlefield: "friendly-units" },
          type: "move",
        },
        type: "spell",
      },
      { cost: { energy: 5, power: ["rainbow", "rainbow"] }, keyword: "Flow", type: "keyword" },
    ],
  },
  // rule 356.2.b / 204.2 — Ruthless Strike: "As an additional cost to play
  // this, you may discard 1. … If you paid the additional cost, deal 5 to it
  // instead." The generator emits `abilities: [null]`; the parser drops the
  // optional-cost clause, so the cost option and the paid rider are spelled
  // out here.
  "ven-008-166": {
    abilities: [
      {
        effect: { additionalCost: { discard: 1 }, optional: true, type: "additional-cost-option" },
        type: "static",
      },
      {
        effect: {
          condition: { type: "paid-additional-cost" },
          else: { amount: 3, target: { location: "battlefield", type: "unit" }, type: "damage" },
          then: { amount: 5, target: { location: "battlefield", type: "unit" }, type: "damage" },
          type: "conditional",
        },
        timing: "action",
        type: "spell",
      },
    ],
  },
  // rule 355.8 / rule 206 — Decree of Unity: "Kill an enemy Chaos ([chaos]) unit
  // or gear." The generator emits `abilities: []` with parseSuccess:false; the
  // rules-text parser has no "unit or gear" mixed-type + domain-adjective form,
  // so without this the spell resolves as a no-op with no target prompt.
  "ven-131-166": {
    abilities: [
      {
        effect: {
          target: {
            controller: "enemy",
            filter: { domain: "chaos" },
            types: ["unit", "gear"],
          },
          type: "kill",
        },
        type: "spell",
      },
    ],
  },
  // rule 355.9 — Siphoning Strike: "Deal 4 to a unit at a battlefield. If you
  // control 7 or more runes, deal 7 to it instead. When it dies this turn,
  // channel 1 rune exhausted." The generator emits `abilities: [null]`, and the
  // rules-text parser folds the three sentences into one flat comma chain,
  // dropping both the "if" gate and the "when it dies" window — so all of
  // 4 + 7 damage plus the channel happen unconditionally. All three steps read
  // the SAME chosen unit, so one target descriptor is shared.
  "ven-146-166": {
    abilities: [
      {
        effect: {
          effects: [
            {
              // "instead" — exactly one of the two damage amounts is dealt.
              condition: { comparison: { gte: 7 }, target: { type: "rune" }, type: "count" },
              else: { amount: 4, target: { location: "battlefield", type: "unit" }, type: "damage" },
              target: { location: "battlefield", type: "unit" },
              then: { amount: 7, target: { location: "battlefield", type: "unit" }, type: "damage" },
              type: "conditional",
            },
            {
              // rule 364.3 — a turn-scoped triggered ability installed on the
              // chosen unit; it pays off only if that unit actually dies.
              duration: "turn",
              effect: { amount: 1, exhausted: true, type: "channel" },
              target: { location: "battlefield", type: "unit" },
              trigger: { event: "die", on: "self" },
              type: "delayed-trigger",
            },
          ],
          type: "sequence",
        },
        type: "spell",
      },
    ],
  },
  // rule 350.1 / 455 — Zed, Without a Sound: "[1][chaos]: Move me and a Shadow
  // Clone you control to each other's locations." The generator emits
  // `abilities: [null]` and the rules-text parser has no "each other's
  // locations" grammar, so the activated ability reached the engine as an
  // unparsed `raw` effect (a silent no-op that still charged the cost). The
  // trade of locations is the same `{type:"move", swap:true}` shape Tideturner
  // and Azir use, with the partner pool restricted to Shadow Clone tokens.
  "ven-112a-166": {
    abilities: [
      {
        effect: {
          location: "base",
          token: { might: 0, name: "Shadow Clone", type: "unit" },
          type: "create-token",
        },
        trigger: { event: "conquer", on: "self" },
        type: "triggered",
      },
      {
        cost: { energy: 1, power: ["chaos"] },
        effect: {
          partner: { controller: "friendly", filter: { name: "Shadow Clone" }, type: "unit" },
          swap: true,
          type: "move",
        },
        timing: "action",
        type: "activated",
      },
    ],
  },
  // Endless Riches — the four printed sentences run together in one paragraph,
  // so the generic splitter keeps them as a single `raw` ability. Only the
  // play trigger is modelled here; the remaining clauses stay as raw statics so
  // the text-matching grants that read them (play-from-trash) keep working.
  "ven-022-166": {
    abilities: [
      // rule 440.1 — banish hand and trash FIRST, then [Burn 7]: the burned
      // cards come from the Main Deck, so the "would go to your trash" clause
      // never replaces them and they stay in the trash.
      {
        effect: {
          effects: [
            {
              target: { controller: "friendly", location: "hand", quantity: "all", type: "card" },
              type: "banish",
            },
            {
              target: { controller: "friendly", location: "trash", quantity: "all", type: "card" },
              type: "banish",
            },
            { amount: 7, player: "self", type: "burn" },
          ],
          type: "sequence",
        },
        trigger: { event: "play-self" },
        type: "triggered",
      },
      { effect: { text: "Skip your Draw Phase.", type: "raw" }, type: "static" },
      { effect: { text: "You may play cards from your trash.", type: "raw" }, type: "static" },
      // rule 571 — a blanket zone-change replacement: the engine reads it off
      // the board via `hasTrashToBanishReplacement` (effect type
      // `trash-to-banish`), so it is not a per-event `replaces` match.
      {
        effect: {
          text: "If a card would go to your trash from anywhere other than your Main Deck, banish it instead.",
          type: "trash-to-banish",
        },
        replaces: "to-trash",
        type: "replacement",
      },
    ],
  },
  // Esteemed Hierophant — "While you control 7 or more runes, prevent all damage
  // that enemy spells and abilities would deal to me." rule 437.4: fully
  // prevented damage is never dealt, so even an over-lethal spell leaves it on 0.
  // Not indestructibility — a "Kill a unit" effect still kills it.
  "ven-025-166": {
    abilities: [
      {
        condition: { amount: 7, type: "runes-at-least" },
        replaces: "take-damage",
        replacement: "prevent",
        sourceController: "enemy",
        target: { self: true },
        type: "replacement",
      },
    ],
  },
  "ven-181-166": {
    abilities: [
      // rule 151.2 — "[Empower] [body][body]" is an ACTIVATED ability, not a
      // printed keyword: activate-ability.ts only enumerates `type:"activated"`
      // abilities, so a `{type:"keyword", keyword:"Empower"}` entry is never
      // offered. Mirrors what parseAbilities() produces for the rules text.
      {
        cost: { power: ["body", "body"] },
        effect: { target: "self", type: "empower" },
        restrictions: [{ type: "not-empowered" }],
        type: "activated",
      },
      {
        condition: { type: "while-empowered" },
        replaces: "might-decrease",
        replacement: { amount: 3, target: "self", type: "modify-might" },
        target: { self: true },
        type: "replacement",
      },
      // rule 366-372 — the same "…give me +3 [Might] instead" replacement covers
      // all three replaced actions; each `replaces` string is matched separately.
      {
        condition: { type: "while-empowered" },
        replaces: "stun",
        replacement: { amount: 3, target: "self", type: "modify-might" },
        target: { self: true },
        type: "replacement",
      },
      {
        condition: { type: "while-empowered" },
        replaces: "return-to-hand",
        replacement: { amount: 3, target: "self", type: "modify-might" },
        target: { self: true },
        type: "replacement",
      },
    ],
  },
  // rule 356.6 / 827.1.c.3 — Risen Altar: "[Empower] costs of your units here
  // cost [1] or [rainbow] less." A battlefield aura discounting the Empower
  // ACTIVATION cost (not a play cost) of its controller's units at that
  // battlefield by one resource; read by activate-ability.ts
  // empowerCostDiscount.
  "ven-163-166": {
    abilities: [
      {
        effect: {
          target: { controller: "friendly", location: "here", type: "unit" },
          type: "empower-cost-reduction",
        },
        type: "static",
      },
    ],
  },
  // rule 355.10.c.1 / 471.1.a.1 — Bottled Constellation: "At the start of your
  // Main Phase, you may kill 3 other friendly units and/or gear to score 1
  // point." The three kills are a cost WITHIN the instruction, so they ride as
  // the trigger's `pay-cost` condition: with fewer than three other friendly
  // permanents the option cannot be taken at all (never a partial kill, never a
  // free point). The effect kills the three the controller picks and then
  // scores — an "effect" point, so the Final-Point restriction never applies.
  // The parser leaves the whole clause as a `raw` no-op.
  "ven-067-166": {
    abilities: [
      {
        condition: {
          cost: {
            kill: {
              amount: 3,
              target: { controller: "friendly", excludeSelf: true, types: ["unit", "gear"] },
            },
          },
          type: "pay-cost",
        },
        effect: {
          effects: [
            {
              target: {
                controller: "friendly",
                excludeSelf: true,
                quantity: { upTo: 3 },
                types: ["unit", "gear"],
              },
              type: "kill",
            },
            { amount: 1, type: "score" },
          ],
          type: "sequence",
        },
        optional: true,
        trigger: { event: "main-phase", on: "controller" },
        type: "triggered",
      },
    ],
  },
  // rule 425 / 827 — Mel, Newly Awakened. The two ungated lines parse fine; the
  // [Empowered] line's phrasing is unique to this card, so the whole ability
  // list is authored here (an explicit `abilities` bypasses the parser).
  // The `uncounterable-spells` static is read by play-spell.ts
  // controllerSpellsUncounterable.
  "ven-069-166": {
    abilities: [
      {
        effect: { amount: 1, type: "draw" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
      {
        cost: { energy: 3 },
        effect: { target: "self", type: "empower" },
        restrictions: [{ type: "not-empowered" }],
        type: "activated",
      },
      {
        condition: { type: "while-empowered" },
        effect: { controller: "friendly", type: "uncounterable-spells" },
        type: "static",
      },
      {
        condition: { type: "while-empowered" },
        effect: { amount: 1, controller: "friendly", type: "additional-might-reduction" },
        type: "static",
      },
    ],
  },
  // rule 383.3.b / 442.1.a — Profiteer: "you may disempower something you
  // control to empower a legend, unit, or gear." The disempower is the base
  // cost of the trigger (only an Empowered object of YOURS can pay it, so the
  // `control` condition keeps the trigger off the chain when nothing can), and
  // the empower has no controller restriction. The parser leaves the whole
  // line as raw text.
  "ven-082-166": {
    abilities: [
      {
        condition: {
          target: { controller: "friendly", filter: "empowered", type: "permanent" },
          type: "control",
        },
        effect: {
          effects: [
            {
              // rule 383.3.b.1 — "disempower … TO empower …": the disempower is
              // the trigger's base cost, paid when the item is finalized (before
              // anyone gets Priority); only the empower waits for resolution.
              costStep: true,
              target: {
                controller: "friendly",
                filter: "empowered",
                promptWhenSingle: true,
                type: "permanent",
              },
              type: "disempower",
            },
            { target: { types: ["legend", "unit", "gear"] }, type: "empower" },
          ],
          type: "sequence",
        },
        optional: true,
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ],
  },
  // rule 477.3.b / 477.3.c — Dame the Despoiler: "[Empowered][>] When I attack
  // or defend, choose a unit here. Increase my Might to its Might this turn,
  // then give me +1 [Might] this turn." The reference unit is the only pick
  // ("a unit here" has no "another", so she may choose herself, for +0), and
  // the increase is one-way. The parser leaves the effect as raw text.
  "ven-079-166": {
    abilities: [
      {
        cost: { energy: 5, power: ["body"] },
        effect: { target: "self", type: "empower" },
        restrictions: [{ type: "not-empowered" }],
        type: "activated",
      },
      {
        condition: { type: "while-empowered" },
        effect: {
          effects: [
            {
              duration: "turn",
              target1: "self",
              target2: { location: "here", type: "unit" },
              type: "increase-might-to",
            },
            { amount: 1, duration: "turn", target: "self", type: "modify-might" },
          ],
          type: "sequence",
        },
        trigger: { event: "attack-or-defend", on: "self" },
        type: "triggered",
      },
    ],
  },
  // rule 356.4 / 466 — Shock Blast: "This costs [2] less if you control
  // something that's [Empowered]." A flat self-discount on the ENERGY only,
  // gated on a board condition rather than a countable scope; read by
  // moves/play/cost.ts getSelfScaledEnergyReduction. The parser drops the line.
  "ven-059-166": {
    abilities: [
      {
        effect: { amount: 4, target: { location: "battlefield", type: "unit" }, type: "damage" },
        timing: "action",
        type: "spell",
      },
      {
        effect: {
          by: 2,
          condition: { controller: "friendly", type: "control-empowered" },
          target: "self",
          type: "cost-reduction",
        },
        type: "static",
      },
    ],
  },
  // rule 355.4 / 355.10.f — Shuriken Flip: "Deal 2 to up to one enemy unit at a
  // battlefield, then move a friendly unit." The parser's damage leaf swallows
  // the whole sentence and drops the move. The move is a MANDATORY second
  // instruction whose unit and destination are picked as the spell resolves
  // (`chooseAtResolution`), so it neither adds a play-time target slot nor gates
  // the play when no friendly unit is on the board.
  "ven-140-166": {
    abilities: [
      {
        effect: {
          effects: [
            {
              amount: 2,
              target: {
                controller: "enemy",
                location: "battlefield",
                quantity: { upTo: 1 },
                type: "unit",
              },
              type: "damage",
            },
            {
              chooseAtResolution: true,
              target: { controller: "friendly", type: "unit" },
              to: "choose",
              type: "move",
            },
          ],
          type: "sequence",
        },
        type: "spell",
      },
      {
        cost: { energy: 3, power: ["rainbow"] },
        keyword: "Flow",
        type: "keyword",
      },
    ],
  },
  // rule 108.2 / 422.1.a — Cataclysmic Duel: "Each player chooses a unit they
  // control. Kill the rest." The parser has no pattern for a per-player keeper
  // choice whose complement dies, so the shape is declared here: `keep: "one"`
  // asks every player (caster first) to name a keeper among the units they
  // CONTROL and then kills every other unit on the board in one batch.
  "ven-090-166": {
    abilities: [
      {
        effect: {
          keep: "one",
          player: "each",
          target: { controller: "friendly", quantity: "all", type: "unit" },
          type: "kill",
        },
        type: "spell",
      },
    ],
  },
  // rule 383.4.c / 185 — Swain, Visionary: "[Vision] / When I conquer, if you've
  // played a non-token unit, a non-token gear, and a spell this turn, you score
  // 1 point." The parser drops the conquer line and duplicates Vision as a bare
  // play-self trigger; the keyword ability alone already synthesises that.
  "ven-173-166": {
    abilities: [
      {
        effect: { amount: 1, from: "deck", then: { recycle: 1 }, type: "look" },
        keyword: "Vision",
        type: "keyword",
      },
      {
        condition: {
          type: "played-types-this-turn",
          types: ["non-token-unit", "non-token-gear", "spell"],
        },
        effect: { amount: 1, type: "score" },
        trigger: { event: "conquer", on: "self" },
        type: "triggered",
      },
    ],
  },
  // rule 355.2 / 419.1.a (rule-id: ven-179-166) — Rengar, Trophy Hunter:
  // "[Ambush] / I can be played to a battlefield where there are enemy units."
  // Line 2 is a play-LOCATION permission (no timing grant); the rules-text
  // parser leaves it as raw text, so both lines are declared here.
  "ven-179-166": {
    abilities: [
      { keyword: "Ambush", type: "keyword" },
      {
        effect: { keyword: "CanPlayToEnemyBattlefield", type: "grant-keyword" },
        type: "static",
      },
    ],
  },
  // rule 464.2.b / 429.1 (rule-id: ven-166-166) — Threshold of the Gray:
  // "When combat starts here, the attacker and defender each [Add] [1]." The
  // instruction names both combatants (190.6.a), which no rules-text pattern
  // expresses, so the ability is declared here.
  "ven-166-166": {
    abilities: [
      {
        effect: { energy: 1, players: ["attacker", "defender"], type: "add-resource" },
        trigger: { event: "combat-start", location: "here", on: { location: "here" } },
        type: "triggered",
      },
    ],
  },
  // rule 356.4 / 364 / 740.1.a (rule-id: ven-164-166) — Sandswept Tomb:
  // "Each spell that chooses one or more units here that are friendly to it
  // costs [rainbow] less." The set data parses nothing (`abilities: []`), and
  // the scope — a discount keyed on the play's chosen targets, reaching EITHER
  // player's spells (364) — has no rules-text pattern, so it is declared here.
  "ven-164-166": {
    abilities: [
      {
        effect: {
          by: { power: ["rainbow"] },
          target: {
            chooses: { controller: "friendly", location: "here", type: "unit" },
            controller: "any",
            type: "spell",
          },
          type: "cost-reduction",
        },
        type: "static",
      },
    ],
  },
  // rule-id: ven-115-166 — printed DRAGON tag, missing from the set data (the
  // generator emits `tags: []` for every non-champion VEN unit). Ocean Drake's
  // "return a non-Dragon unit" reads the tag, so the drakes themselves — and
  // every other printed Dragon in the set — must carry it.
  "ven-016-166": { tags: ["Dragon"] },
  "ven-048-166": { tags: ["Dragon"] },
  "ven-091-166": { tags: ["Dragon"] },
  "ven-115-166": { tags: ["Dragon"] },
  // rule 186 — printed token card (exists only on the board / chain).
  "ven-t04": { isToken: true },
};

function adaptJsonCard(c: Record<string, unknown>): Card {
  const domains = c.domains as string[] | undefined;
  // Rule 355.8: a set-JSON `abilities: [null]` is a generator parse miss, not a
  // hand-authored opt-out. Emitting [] here makes enrichCard() skip re-parsing
  // rulesText, so a targeted spell reaches the engine with no target descriptor
  // and is offered with zero legal targets. Leave the field undefined when no
  // real ability survived so enrichCard() re-parses from rulesText.
  const parsedAbilities = ((c.abilities as unknown[]) ?? []).filter(Boolean);
  return {
    abilities: parsedAbilities.length > 0 ? parsedAbilities : undefined,
    cardNumber: c.collectorNumber,
    cardType: c.cardType,
    domain: domains?.length === 1 ? domains[0] : domains,
    energyCost: c.energy ?? c.energyCost,
    id: c.id,
    isChampion: c.isChampion,
    keywords: c.keywords,
    might: c.might,
    mightBonus: c.mightBonus ?? undefined,
    name: c.name,
    powerCost: derivePowerCost(c.id as string, domains, c.power as number | null) ?? c.powerCost,
    rarity: c.rarity,
    rulesText: c.rulesText,
    setId: c.set,
    tags: c.tags,
    timing: c.timing,
    ...JSON_CARD_ENGINE_FLAGS[c.id as string],
  } as unknown as Card;
}

import ognJson from "./sets/ogn.json";
import ogsJson from "./sets/ogs.json";
import sfdJson from "./sets/sfd.json";
import unlJson from "./sets/unl.json";
import venJson from "./sets/ven.json";
const JSON_SETS = [venJson] as { cards: Record<string, unknown>[] }[];
const ALL_SET_JSON = [ognJson, ogsJson, sfdJson, unlJson, venJson] as {
  cards: Record<string, unknown>[];
}[];

/**
 * Per-card power-pip domain overrides, resolved by reading the printed card art.
 * Visual audit (2026-08) of all 41 multi-domain cards found every one uses a
 * left/right split hybrid pip capsule — each pip is payable by either of the
 * card's two domains, which the engine models as "rainbow". No card prints
 * distinct single-domain pips, so this map is currently empty; keep it as the
 * hook for any future card that does.
 */
const MULTI_DOMAIN_POWER_OVERRIDES: Record<string, string[]> = {};

/**
 * Expand a set-JSON `{domains, power: N}` into the engine's `powerCost: Domain[]`.
 * Single-domain cards require N of that domain; multi-domain cards use N rainbow
 * (all 41 verified as split hybrid pips — see MULTI_DOMAIN_POWER_OVERRIDES).
 */
function derivePowerCost(
  id: string,
  domains: string[] | undefined,
  power: number | null | undefined,
): string[] | undefined {
  const override = MULTI_DOMAIN_POWER_OVERRIDES[id];
  if (override) {return override;}
  if (!power || power <= 0) {return undefined;}
  const domain = domains && domains.length === 1 ? domains[0] : "rainbow";
  return Array.from({ length: power }, () => domain);
}

const _powerCostById = new Map<string, string[]>();
for (const set of ALL_SET_JSON) {
  for (const c of set.cards) {
    const pc = derivePowerCost(c.id as string, c.domains as string[] | undefined, c.power as number | null);
    if (pc) {_powerCostById.set(c.id as string, pc);}
  }
}

/**
 * Hand-authored .ts card definitions predate power extraction and carry no
 * `powerCost`. Backfill from the regenerated set JSON so the engine's
 * canAffordCard/deductCost see the real domain requirement.
 */
function backfillPowerCost(cards: Card[]): Card[] {
  return cards.map((card) => {
    if (card.powerCost !== undefined) {return card;}
    const pc = _powerCostById.get(card.id);
    return pc ? ({ ...card, powerCost: pc } as Card) : card;
  });
}

/**
 * Get all cards with parsed abilities attached.
 */
export function getAllCards(): Card[] {
  if (!_cachedCards) {
    const jsonCards = JSON_SETS.flatMap((s) => s.cards.map(adaptJsonCard));
    _cachedCards = enrichCards(backfillPowerCost([...getRawCards(), ...jsonCards]));
  }
  return _cachedCards;
}

/**
 * Get all cards indexed by ID (with parsed abilities).
 */
export function getCardRegistry(): Map<string, Card> {
  const registry = new Map<string, Card>();
  for (const card of getAllCards()) {
    registry.set(card.id, card);
  }
  return registry;
}

/**
 * Clear the cached cards (for testing).
 */
export function clearCardCache(): void {
  _cachedCards = null;
}
