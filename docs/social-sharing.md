# Friends and shared materials

The online features require the existing Google login. Local mode keeps the
navigation and profile fields but does not simulate other people.

## Identity and visibility

University and unique username (stored as `nickname`) are saved with the
study profile. Onboarding requests missing usernames and universities, including for
existing accounts. Nickname claims and changes are transactional. Friends is
always enabled: profile saves and the Friends API automatically create or repair
`socialProfiles`. Existing visibility and statistics preferences are preserved;
`socialDirectory` contains only discoverable profiles.
Degree and university fields share a keyboard-accessible suggestion input in
both onboarding and Account. Custom entries remain accepted. University
suggestions are drawn from the [MUR list of state universities](https://www.mur.gov.it/it/aree-tematiche/universita/le-universita/universita-statali);
known names/acronyms normalize to one institution while campuses remain distinct.
The displayed `@` is a prefix, not part of the stored username. Suggested handles
derive from the account name (`Iacopo Paolucci` → `iacopo.paolucci`), can be edited,
and must pass the existing transactional uniqueness check when saved.
Search matches prefixes of normalized names and nicknames. Suggestions match
normalized university names. All collections remain behind the authenticated
server; the existing Firestore rules deny browser access.

Friendship edges require acceptance by the recipient. Presence is recorded per
visible browser tab, expires after 90 seconds and refreshes every 30 seconds.
“Sta studiando” appears immediately for a running timer or after five minutes
of continuous visible presence. Heartbeats preserve the tab's `onlineSince`;
expired or hidden tabs restart that interval. Hidden tabs withdraw their presence, and
stale tab records are cleaned on a subsequent heartbeat. Only accepted friends
can read presence and study totals, subject to the sharing preference.

The home loads the calendar and friends ranking together. User-scoped snapshots
persist locally for up to thirty days as a stale preview, with background refresh
on every visit and invalidation on successful social mutations. Cached rankings
remain visible during refresh or network failure. Changed visible names, order
or study minutes fade in for 240 ms; reduced-motion preferences disable the fade.
User menus support removing friends, reporting and blocking. Reports are stored
in server-only `socialReports` with the authenticated reporter identity. Pairwise
`socialBlocks` retain each person's independent block, atomically remove pending
or accepted friendships, and exclude both parties from search and activity.
Unblocking in Friends settings does not restore the friendship.

Rankings default to today, with month and all-time tabs. Time is calculated
from saved sessions with overlapping ranges merged. Pages come from each
student's daily reading activity. Calendar boundaries use Europe/Rome.

## Copies and public courses

`sharedMaterials` stores explicit snapshots. Public courses are indexed in a
per-degree `publicCourseFeeds` collection; university of origin is displayed
but is not a restriction on discovery. Changing the author's profile does not
rewrite the provenance captured when a file was uploaded. Legacy files without
provenance cannot be assigned a historical university reliably.

Public snapshots exclude notes, read progress, personal chat and quiz results.
Analyses and quizzes remain available. Direct snapshots can include existing
chats and the author's quiz answers/results. A share supports up to 50 selected
friends. Snapshot creation currently supports 50 PDFs / 5,000 analyzed slides
per operation; collaborators can instead use a common workspace.

Imported courses have independent metadata, slides, quizzes and progress.
`sharedBlobId` references the immutable original PDF through `sharedBlobs`;
imports do not download or duplicate PDF objects. Shared generated images use
explicit server-side asset references. Promoted originals/assets are retained
after source deletion so existing personal copies remain usable. Garbage
collection of unreferenced promoted blobs is intentionally not implemented;
do not delete these objects using only the original owner's metadata.

Returning a publication to private prevents new imports. Existing personal
copies and their quiz groups remain available to their students. Publishing
again creates a new snapshot rather than modifying existing personal copies.

## Coauthor workspaces

Course invitations can grant coauthor access after the recipient accepts the
invitation. `sharedWorkspaces` stores the owner, member IDs and each member's
chat visibility boundary. `collaborativeDocuments` maps document IDs back to
their source owner and course. Access is resolved and membership checked before
using shared caches, metadata, quiz collections or binary assets.

Members use the same course, slides, chat, maps and newly uploaded files.
Excluding chat history from an invitation hides conversations before joining;
analyses and subsequent messages remain common. Existing personal quiz results
are not exposed through legacy inline chat quizzes. Reading state and current
page use per-student `readingStates`; quiz results use per-student `quizResults`.
Members see updates while the workspace is visible, polled every 10 seconds
without replacing pending local writes or generation.

Only the owner may delete/publish the course or move its PDF outside the shared
space. The owner can remove members; they lose server access and cannot reuse
the old invitation. A member can leave, then intentionally rejoin an active
invitation. Revoking an invitation prevents future joins; removing an existing
member is a separate explicit action.

## Quiz groups

Snapshot quiz IDs are remapped while preserving their group association.
Group access requires membership matching the student's actual document/quiz.
Coauthors also get a group for the common quiz. Peer result endpoints require a
saved personal completion before returning any result, including answers
explicitly included by the sender. Each student can publish a score with or
without their own answers and can withdraw it. Results are computed on the
server using the existing quiz scoring rules; this is a study comparison,
not a proctored exam system.

## Validation

- `npm.cmd test`: domain transitions, privacy, provenance, nickname claims,
  shared references, revoked access, separate progress and quiz result gating.
- `npm.cmd run test:e2e -- social.spec.ts study-profile.spec.ts`: responsive
  navigation, friend requests/search/rankings, multi-recipient sharing,
  onboarding/profile persistence and immutable upload provenance. Social UI
  responses are mocked; upload/profile checks use the local API.

Production Firebase credentials and a live multi-account deployment are not
used by this suite. No new client Firestore rules or composite indexes are
required by these queries.
