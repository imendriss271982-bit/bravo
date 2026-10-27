# ADHD Winner sur téléphone — état actuel et plan d'évolution

## 1. Aujourd'hui : une PWA installable (octobre 2026)

| | Android (Chrome) | iPhone (Safari) | Ordinateur |
|---|---|---|---|
| Installation | Bouton « Install » dans Profil, ou menu ⋮ → Installer | Partager ⬆ → « Sur l'écran d'accueil » (pas de bouton possible) | Icône d'installation dans la barre d'adresse |
| Fonctionne hors ligne | Oui (service worker) | Oui | Oui |
| Écran de lancement | Généré par Android (couleur + icône du manifeste) | Images `splash/` (8 tailles d'iPhone) | — |
| Notifications | Oui, après autorisation | Seulement si l'app est installée sur l'écran d'accueil (iOS 16.4 et plus) | Oui |

### Ce qui sonne vraiment (à ne jamais promettre au-delà)

- **App ouverte** : alarmes et rappels sonnent, pop-up + voix de Noor. Fiable.
- **App en arrière-plan** : une notification peut s'afficher, mais le téléphone met l'app en pause après quelques minutes. Les minuteurs JavaScript s'arrêtent alors. Pas fiable.
- **App fermée** : une application web ne peut pas programmer une alarme dans le téléphone. Aucun navigateur ne le permet aujourd'hui (l'API « Notification Triggers » de Chrome a été testée puis abandonnée).

### Solutions de secours en place

1. **Alarmes manquées** : à la réouverture, ADHD Winner affiche « While you were away » avec la liste. Rien n'est marqué comme fait, pas d'XP.
2. **Calendrier du téléphone (.ics)** : bouton « Add to my phone calendar » dans chaque rendez-vous, et « Add my upcoming alarms » dans le Calendrier. C'est le calendrier du téléphone qui sonne : fiable même app fermée. Limite : une modification faite ensuite dans l'app n'est pas recopiée.
3. **Vérification immédiate au retour** dans l'app (au lieu d'attendre 10 à 20 s).
4. **Profil → This phone** : état réel (installée ? notifications ?) et explication honnête.

## 2. Étape suivante possible : notifications « push » depuis un serveur

Principe : le téléphone donne une adresse push ; un petit serveur (Cloudflare Worker + tâche planifiée chaque minute) envoie la notification à l'heure de l'alarme. Fonctionne app fermée sur Android, et sur iPhone si l'app est installée.

- Coût : gratuit ou presque sur Cloudflare (Workers, KV, Cron Triggers).
- Travail : clés VAPID, enregistrement de l'abonnement, copie des alarmes vers le serveur, gestion des modifications/suppressions.
- Risques : les heures des alarmes quittent le téléphone (à expliquer dans la politique de confidentialité) ; dépend du réseau ; Apple et Google peuvent retarder une notification.
- À tester avant de décider d'aller plus loin.

## 3. Si la PWA ne suffit pas : application native (Capacitor)

Capacitor emballe le code actuel (`index.html`) dans une vraie app Android/iOS, sans tout réécrire.

| | Gain | Coût / risque |
|---|---|---|
| Alarmes | Notifications locales programmées par le système : sonnent app fermée, sans serveur | — |
| Store | Présence sur Google Play / App Store | Google : 25 $ une fois. Apple : 99 $ par an + un Mac pour publier |
| Paiements Premium | Achats intégrés | Commission Apple/Google (15 à 30 %), règles des stores |
| Maintenance | — | Deux apps à publier à chaque mise à jour, validation Apple (1 à 3 jours) |

**Critère de décision** : passer à Capacitor si les tests réels montrent que les alarmes manquées gênent vraiment les utilisateurs, même avec le calendrier du téléphone et le push.

## 4. Sauvegarde (avant Premium)

Profil → Backup : un fichier JSON (`adhd-winner-backup-AAAA-MM-JJ.json`) avec tâches, catégories, horaires, rappels, préférences, XP, statistiques, notes (et les notes vocales jusqu'à 25 Mo).

- Import : vérification du fichier, nettoyage des valeurs, deux choix (« Add to my data » sans doublons, ou « Replace » avec double confirmation), bouton Annuler juste après.
- Le forfait (Free/Premium/Business) n'est **jamais** pris dans un fichier : sinon on pourrait débloquer Premium en modifiant le fichier. Quand les paiements arriveront, le forfait devra venir d'un serveur.
