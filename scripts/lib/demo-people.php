<?php
/**
 * Who the demo can sign in as, in the order the demo script meets them
 * (CAP-51, CAP-54). One table for the laptop preflight and for the live demo's
 * personas.json, so the two cannot disagree. Priya R and Tom H are the
 * rehearsal stand-ins for Noor (Demo-Script).
 *
 * Each row: [id, name as the seeder prints it, role hint, token slot].
 */
const DEMO_PEOPLE = [
    ['jane', 'Jane N', 'Student', 'student'],
    ['noor', 'Noor A', 'Student', 'student'],
    ['sam', 'Sam O', 'Assessor', 'assessor'],
    ['lee', 'Dr Lee', 'Supervisor', 'supervisor'],
    ['priya', 'Priya R', 'Student', 'student'],
    ['tom', 'Tom H', 'Student', 'student'],
];
