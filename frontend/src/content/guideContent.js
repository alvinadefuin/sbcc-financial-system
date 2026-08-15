import {
  LogIn,
  PlusCircle,
  Calculator,
  Edit3,
  WifiOff,
  Clock,
  Compass,
  KeyRound,
  LayoutDashboard,
  BarChart2,
  Calendar,
  BookOpen,
  ClipboardCopy,
  FileSpreadsheet,
  Trash2,
  Settings,
  UserPlus,
  ShieldCheck,
  UserCog,
  History,
} from 'lucide-react';

// Higher rank sees everything a lower rank sees.
export const ROLE_RANK = { user: 0, admin: 1, super_admin: 2 };

/**
 * Every topic in both guides, in display order.
 *
 * Steps name the real on-screen button labels, in short plain sentences.
 * `hint` is an optional Taglish note, used only where the behaviour is
 * genuinely confusing — not as a translation of every step.
 */
export const GUIDE_TOPICS = [
  // ---------------------------------------------------------------- mobile
  {
    id: 'mobile-signing-in',
    platform: 'mobile',
    group: 'Getting started',
    minRole: 'user',
    icon: LogIn,
    title: 'Signing in',
    summary: 'Getting into the app on your phone.',
    steps: [
      'Open the app link your admin sent you.',
      'Type the email address your admin registered for you.',
      'Type your password, then tap Sign In.',
      'If the password does not work, ask your admin to reset it for you. There is no password screen on the phone — only the admin can change it.',
    ],
    hint: 'Hindi gumagana ang password? Hindi mo kayang palitan sa phone — hingin sa admin na i-reset.',
  },
  {
    id: 'mobile-submit-collection',
    platform: 'mobile',
    group: 'Sending collections',
    minRole: 'user',
    icon: PlusCircle,
    title: 'Send in a collection',
    summary: 'The main thing you will do — recording what was collected.',
    steps: [
      'Tap the Submit tab.',
      'Choose Collection at the top (tap Expense instead if you are recording money the church spent).',
      'Pick the date the money was collected.',
      'Choose Cash or GCash under payment method.',
      'Type the amount beside each fund. Leave a fund blank if there was nothing for it.',
      'Control number, cheque number, and forms number are optional — leave them empty if you do not have them.',
      'Check the total at the bottom, then tap Submit.',
    ],
  },
  {
    id: 'mobile-count-cash',
    platform: 'mobile',
    group: 'Sending collections',
    minRole: 'user',
    icon: Calculator,
    title: 'Counting cash quickly',
    summary: 'Let the app add up the bills and coins for you.',
    steps: [
      'On the Submit tab, open the denomination calculator.',
      'Beside each bill and coin, type how many pieces you counted.',
      'The total adds itself up as you type — you do not need a separate calculator.',
      'Use that total to fill in the amount on the form.',
    ],
  },
  {
    id: 'mobile-sunday-collection',
    platform: 'mobile',
    group: 'Sending collections',
    minRole: 'user',
    icon: ClipboardCopy,
    title: 'Send the collection to the group chat',
    summary: 'Copying the Sunday total to post in Messenger.',
    steps: [
      'Tap the Summary tab.',
      'Tap the Sunday on the calendar. Only dates that already have records can be tapped.',
      'Read the message — it lists each fund and the total.',
      'Type in the attendance line yourself if you want it.',
      'Tap Copy message, open Messenger, and paste.',
    ],
    hint: 'Kung wala pang naka-record na collection sa araw na iyon, hindi ito matatap sa calendar.',
  },
  {
    id: 'mobile-add-supplement',
    platform: 'mobile',
    group: 'Sending collections',
    minRole: 'user',
    icon: Edit3,
    title: 'Adding a supplement',
    summary: 'Recording extra money for an entry you already sent.',
    steps: [
      'Tap the Recent tab.',
      'Tap the record you want to add to.',
      'Tap the supplement option shown on that record.',
      'The form opens with the same date already filled in and the other payment method selected.',
      'Type the extra amount, then tap Submit.',
    ],
  },
  {
    id: 'mobile-offline',
    platform: 'mobile',
    group: 'When there is no signal',
    minRole: 'user',
    icon: WifiOff,
    title: 'No internet? It still works',
    summary: 'What happens when you submit with no signal.',
    steps: [
      'Fill in and submit the form the same way you always do.',
      'The entry is saved on your phone. Nothing is lost.',
      'A small amber number appears on the Recent tab counting what is still waiting to be sent.',
      'When your signal comes back, the app sends everything by itself. You do not need to re-type anything.',
      'Do not clear the app data or uninstall the app while entries are still waiting.',
    ],
    hint: 'Walang internet? Okay lang — naka-save sa phone mo. Automatic na masi-send pagbalik ng signal. Huwag lang i-uninstall ang app habang may naghihintay.',
  },
  {
    id: 'mobile-check-sent',
    platform: 'mobile',
    group: 'When there is no signal',
    minRole: 'user',
    icon: Clock,
    title: 'Checking what you already sent',
    summary: 'Telling a waiting entry apart from a sent one.',
    steps: [
      'Tap the Recent tab to see your latest entries.',
      'An entry marked pending is still waiting for signal — it has not reached the office yet.',
      'An entry with no pending mark has been received and saved.',
      'If an entry says it failed, tap retry on that entry.',
    ],
  },

  // --------------------------------------------------------------- desktop
  {
    id: 'desktop-signing-in',
    platform: 'desktop',
    group: 'Getting started',
    minRole: 'user',
    icon: LogIn,
    title: 'Signing in',
    summary: 'Getting into the dashboard on a computer.',
    steps: [
      'Open the app in your web browser.',
      'Type your email address and password, then click Sign In.',
      'If the password does not work, ask a super admin to reset it for you.',
    ],
  },
  {
    id: 'desktop-navigating',
    platform: 'desktop',
    group: 'Getting started',
    minRole: 'user',
    icon: Compass,
    title: 'Finding your way around',
    summary: 'What the menu down the left side does.',
    steps: [
      'The menu on the left is how you move between pages. Click any item to open it.',
      'The items are put into small groups — Overview, and whichever other groups your account is allowed to see.',
      'Use the arrow button at the top of the menu to shrink it and give yourself more room. Click it again to bring the labels back.',
      'On a small screen the menu is hidden — tap the three-line button at the top left to slide it open.',
    ],
  },
  {
    id: 'desktop-change-password',
    platform: 'desktop',
    group: 'Getting started',
    minRole: 'user',
    icon: KeyRound,
    title: 'Changing your password',
    summary: 'Setting a new password for yourself.',
    steps: [
      'Click Change Password near the bottom of the left menu.',
      'Type your current password, then your new one twice.',
      'Click save. Use the new password the next time you sign in.',
    ],
  },
  {
    id: 'desktop-dashboard-cards',
    platform: 'desktop',
    group: 'Reading your numbers',
    minRole: 'user',
    icon: LayoutDashboard,
    title: 'The dashboard at a glance',
    summary: 'What the boxes across the top are telling you.',
    steps: [
      'Click Dashboard in the left menu.',
      'The boxes across the top summarise the period you have selected — money received, money spent, and what is left.',
      'Every peso figure covers only the month and year selected at the top of the page.',
      'These boxes are a summary, not the records themselves. To see individual entries, open Manage Records or Reports.',
    ],
  },
  {
    id: 'desktop-charts',
    platform: 'desktop',
    group: 'Reading your numbers',
    minRole: 'user',
    icon: BarChart2,
    title: 'Reading the charts',
    summary: 'Comparing collections against expenses over time.',
    steps: [
      'Click Analytics in the left menu.',
      'Each chart plots collections against expenses so you can see them side by side.',
      'Hold your pointer over any bar, line, or slice to see the exact peso amount.',
      'A month with a taller expense bar than collection bar is a month the church spent more than it received.',
    ],
  },
  {
    id: 'desktop-pick-period',
    platform: 'desktop',
    group: 'Reading your numbers',
    minRole: 'user',
    icon: Calendar,
    title: 'Choosing a month or year',
    summary: 'Changing which period every figure covers.',
    steps: [
      'Use the month and year pickers at the top of the page.',
      'Everything on the page — the boxes and the charts — redraws for the period you picked.',
      'If the page looks empty, check the period first. It usually means no records were entered for that month.',
    ],
  },
  {
    id: 'desktop-report-totals',
    platform: 'desktop',
    group: 'Reports',
    minRole: 'user',
    icon: BookOpen,
    title: 'Collections, Expenses, and Net Surplus',
    summary: 'What the three report figures actually count.',
    steps: [
      'Click Reports in the left menu.',
      'Collections Total is every peso received in the selected period.',
      'Expenses Total is every peso spent in the same period.',
      'Net Surplus is Collections minus Expenses.',
      'A negative Net Surplus means the church spent more than it received that period. It is not an error in the app.',
    ],
    hint: 'Kapag negative ang Net Surplus, mas malaki ang gastos kaysa nakolekta — hindi ito mali ng system.',
  },
  {
    id: 'desktop-sunday-collection',
    platform: 'desktop',
    group: 'Reports',
    minRole: 'user',
    icon: ClipboardCopy,
    title: 'Sending the collection to the group chat',
    summary: 'Copying the Sunday total to post in Messenger.',
    steps: [
      'Click Sunday Collection in the left menu.',
      'Pick the Sunday on the calendar. Only dates that already have collection records can be clicked.',
      'Check the message that appears — it lists each fund and the total.',
      'Type in the attendance line yourself if you want it, or edit any wording.',
      'Click Copy, then paste it into the group chat.',
    ],
    hint: 'Ang GCash ay may sariling linya kahit tithes din ito — ganoon lang ipinapakita sa mensahe.',
  },
  {
    id: 'desktop-google-sheets',
    platform: 'desktop',
    group: 'Reports',
    minRole: 'user',
    icon: FileSpreadsheet,
    title: 'Sending records to Google Sheets',
    summary: 'Copying the records into a spreadsheet.',
    steps: [
      'Click Reports in the left menu and find the Google Sheets section.',
      'Create a Google Sheet, or open the one the church already uses.',
      'In Google Sheets, click Share, paste in the address shown on the Reports page, and set it to Editor. Viewer is not enough — the app has to write into the sheet.',
      'Copy the sheet link or ID back into the Reports page and save it.',
      'Click Sync. A tab is created for the year and filled with the records.',
      'If syncing fails, the sharing is almost always the cause. Re-check that the address has Editor access.',
    ],
    hint: 'Sa Google Sheets, dapat Editor ang access — hindi Viewer. Ito ang pinaka-madalas na dahilan kung bakit hindi mag-sync.',
  },
  {
    id: 'desktop-edit-record',
    platform: 'desktop',
    group: 'Managing records',
    minRole: 'admin',
    icon: Edit3,
    title: 'Fixing a wrong entry',
    summary: 'Correcting a record a collector already sent.',
    steps: [
      'Click Manage Records in the left menu.',
      'Choose the Collections tab or the Expenses tab.',
      'Find the record and click its edit button.',
      'Change the amounts or details that are wrong. The total recalculates by itself — you do not type it.',
      'Save. The change is recorded in the Activity Log along with your name.',
      'New entries are added from the phone, not from this page.',
    ],
  },
  {
    id: 'desktop-delete-record',
    platform: 'desktop',
    group: 'Managing records',
    minRole: 'admin',
    icon: Trash2,
    title: 'Deleting an entry',
    summary: 'Removing a record that should not be there.',
    steps: [
      'Click Manage Records, then the Collections or Expenses tab.',
      'Find the record and click its delete button.',
      'Confirm when asked.',
      'If the amounts are merely wrong, edit the record instead of deleting it — editing keeps the history.',
    ],
    hint: 'Mali lang ang halaga? I-edit na lang, huwag i-delete — mas maganda para may record.',
  },
  {
    id: 'desktop-mobile-fields',
    platform: 'desktop',
    group: 'Mobile form fields',
    minRole: 'admin',
    icon: Settings,
    title: 'Turning phone form fields on and off',
    summary: 'Choosing what collectors see on their phones.',
    steps: [
      'Click Mobile Form Fields in the left menu.',
      'Choose Collection Fields or Expense Fields.',
      'Switch a field off to hide it from the phone form, or on to show it.',
      'The change reaches collectors immediately, so tell them before you change anything mid-collection.',
      'Turning a field off hides it from new entries. Records already sent keep the values they had.',
    ],
  },
  {
    id: 'desktop-add-user',
    platform: 'desktop',
    group: 'Users and access',
    minRole: 'admin',
    icon: UserPlus,
    title: 'Adding a user',
    summary: 'Giving a new collector an account.',
    steps: [
      'Click Users in the left menu.',
      'Click Add User.',
      'Fill in their name, email address, and a starting password.',
      'Choose their role — pick User for a collector.',
      'Click Add User to save, then pass them the email address and password you set.',
    ],
  },
  {
    id: 'desktop-roles',
    platform: 'desktop',
    group: 'Users and access',
    minRole: 'admin',
    icon: ShieldCheck,
    title: 'What each role can do',
    summary: 'Choosing the right role for someone.',
    steps: [
      'User — sends collections and expenses from the phone. This is the right role for most collectors.',
      'Admin — everything a User can do, plus managing records, users, and the phone form fields.',
      'Super Admin — everything an Admin can do, plus the Activity Log. Only a Super Admin can create another Admin.',
      'When unsure, choose User. You can raise someone later; you cannot un-see what a wider role exposed.',
    ],
  },
  {
    id: 'desktop-edit-user',
    platform: 'desktop',
    group: 'Users and access',
    minRole: 'admin',
    icon: UserCog,
    title: 'Editing or removing access',
    summary: 'Updating someone, or stopping them signing in.',
    steps: [
      'Click Users in the left menu.',
      'Find the person in the list and click edit.',
      'Change their name, role, or password, then save.',
      'To stop someone signing in — a collector who has left the church, for example — remove their access from this same list.',
      'An Admin cannot change a Super Admin account. Ask a Super Admin to do it.',
    ],
  },
  {
    id: 'desktop-activity-log',
    platform: 'desktop',
    group: 'Audit',
    minRole: 'super_admin',
    icon: History,
    title: 'Reading the Activity Log',
    summary: 'Seeing who changed what, and when.',
    steps: [
      'Click Activity Log in the left menu.',
      'Each line shows the date and time, who did it, and what they did.',
      'Click a line to open it and see exactly which values changed, from what to what.',
      'Use the filter to narrow the list down to collections or expenses.',
      'Nothing here can be edited or deleted, by anyone. That is the point — it is the record of record.',
    ],
  },
];

/**
 * Topics for one platform, filtered to what this role may see,
 * grouped in display order.
 *
 * An unknown, missing, or null role falls back to `user` — the narrowest
 * view — so a bad role value can never leak admin instructions.
 *
 * @param {{ platform: 'mobile' | 'desktop', role?: string }} options
 * @returns {Array<{ group: string, topics: Array<object> }>}
 */
export function getGuideTopics({ platform, role }) {
  const rank = ROLE_RANK[role] ?? ROLE_RANK.user;

  const visible = GUIDE_TOPICS.filter(
    (topic) => topic.platform === platform && rank >= ROLE_RANK[topic.minRole]
  );

  return visible.reduce((groups, topic) => {
    const existing = groups.find((group) => group.group === topic.group);
    if (existing) existing.topics.push(topic);
    else groups.push({ group: topic.group, topics: [topic] });
    return groups;
  }, []);
}
