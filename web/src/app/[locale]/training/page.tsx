"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Staff, type CoachAssignment, type TrainingPlayer, type StaffCostSummary, type TrainingUpdate } from "@/lib/api";

interface CoachPlayerWithGK extends CoachAssignment {
  isGoalkeeper: boolean;
}
import PlayerStatsCard from "@/components/player/PlayerStatsCard";

const STAFF_ROLE_LABELS: Record<string, { label: string; labelEn: string }> = {
  head_coach: { label: "主教练", labelEn: "Head Coach" },
  fitness_coach: { label: "体能教练", labelEn: "Fitness Coach" },
  psychology_coach: { label: "心理教练", labelEn: "Psychology Coach" },
  technical_coach: { label: "技术教练", labelEn: "Technical Coach" },
  set_piece_coach: { label: "定位球教练", labelEn: "Set Piece Coach" },
  goalkeeper_coach: { label: "门将教练", labelEn: "Goalkeeper Coach" },
  team_doctor: { label: "队医", labelEn: "Team Doctor" },
};

const SPECIALIZED_COACH_TYPES = [
  { value: "technical_coach", label: "技术教练", labelEn: "Technical Coach" },
  { value: "psychology_coach", label: "心理教练", labelEn: "Psychology Coach" },
  { value: "set_piece_coach", label: "定位球教练", labelEn: "Set Piece Coach" },
  { value: "goalkeeper_coach", label: "门将教练", labelEn: "Goalkeeper Coach" },
];

// Skills available for each coach category
const COACH_SKILLS: Record<string, { value: string; label: string; labelEn: string }[]> = {
  technical_coach: [
    { value: "finishing", label: "射门", labelEn: "Finishing" },
    { value: "passing", label: "传球", labelEn: "Passing" },
    { value: "dribbling", label: "盘带", labelEn: "Dribbling" },
    { value: "defending", label: "防守", labelEn: "Defending" },
  ],
  psychology_coach: [
    { value: "positioning", label: "跑位", labelEn: "Positioning" },
    { value: "composure", label: "沉着", labelEn: "Composure" },
  ],
  set_piece_coach: [
    { value: "freeKicks", label: "任意球", labelEn: "Free Kicks" },
    { value: "penalties", label: "点球", labelEn: "Penalties" },
  ],
  goalkeeper_coach: [
    { value: "reflexes", label: "反应", labelEn: "Reflexes" },
    { value: "handling", label: "扑救", labelEn: "Handling" },
    { value: "aerial", label: "高空球", labelEn: "Aerial" },
  ],
};

const MAX_PLAYERS_PER_COACH = 3;
const MAX_SPECIALIZED_COACHES = 2;

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Get skill label by key
const getSkillLabel = (skillKey: string, locale: string): string => {
  for (const [coachType, skills] of Object.entries(COACH_SKILLS)) {
    const skill = skills.find(s => s.value === skillKey);
    if (skill) {
      return locale === 'zh' ? skill.label : skill.labelEn;
    }
  }
  return skillKey;
};

export default function TrainingPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { team } = useAuth();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [trainingPreview, setTrainingPreview] = useState<TrainingPlayer[]>([]);
  const [assignments, setAssignments] = useState<Map<string, CoachAssignment[]>>(new Map());
  const [staminaIntensity, setStaminaIntensity] = useState(0.1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Hire coach modal
  const [showHireModal, setShowHireModal] = useState(false);
  const [showHireFitnessModal, setShowHireFitnessModal] = useState(false);
  const [costSummary, setCostSummary] = useState<StaffCostSummary | null>(null);
  const [selectedCoachType, setSelectedCoachType] = useState("technical_coach");
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [selectedTrainedSkill, setSelectedTrainedSkill] = useState<string | undefined>(undefined);
  const [isHiring, setIsHiring] = useState(false);

  // Fire coach confirmation
  const [showFireConfirm, setShowFireConfirm] = useState<string | null>(null);
  const [isFiring, setIsFiring] = useState(false);

  // Upgrade fitness coach modal
  const [showUpgradeFitnessModal, setShowUpgradeFitnessModal] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // Edit trained skill state
  const [editingTrainedSkillCoachId, setEditingTrainedSkillCoachId] = useState<string | null>(null);
  const [newTrainedSkill, setNewTrainedSkill] = useState<string | null>(null);
  const [isUpdatingSkill, setIsUpdatingSkill] = useState(false);

  // Drag state
  const [draggedPlayer, setDraggedPlayer] = useState<{ playerId: string; playerName: string; isGoalkeeper: boolean } | null>(null);

  // Pending assignments state
  const [pendingAssignments, setPendingAssignments] = useState<Map<string, Set<string>>>(new Map());
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set()); // Format: "${coachId}-${playerId}"
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [latestUpdate, setLatestUpdate] = useState<TrainingUpdate | null>(null);

  // Training update selector state
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [availableUpdates, setAvailableUpdates] = useState<{ season: number; week: number }[]>([]);
  const [currentGame, setCurrentGame] = useState<{ season: number; week: number }>({ season: 1, week: 1 });

  // Expanded player card state
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  // Get max selectable week for a given season
  const getMaxWeekForSeason = (season: number): number => {
    if (season === currentGame.season) return currentGame.week;
    const seasonUpdates = availableUpdates.filter(u => u.season === season);
    if (seasonUpdates.length > 0) {
      return Math.max(...seasonUpdates.map(u => u.week));
    }
    return 16; // default to full season
  };

  const hasPendingChanges = pendingAssignments.size > 0 || pendingRemovals.size > 0;

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Sync localStaminaIntensity when staminaIntensity loads from API
  useEffect(() => {
    setLocalStaminaIntensity(staminaIntensity);
  }, [staminaIntensity]);

  // Generate key for pending removal tracking (use :: separator to avoid UUID conflicts)
  const pendingKey = (coachId: string, playerId: string) => `${coachId}::${playerId}`;
  const parsePendingKey = (key: string): [string, string] => {
    const lastSepIndex = key.lastIndexOf('::');
    return [key.slice(0, lastSepIndex), key.slice(lastSepIndex + 1)];
  };

  useEffect(() => {
    if (!team?.id) return;

    Promise.all([
      api.staff.getAll(),
      api.training.getWeeklyPoints(),
      api.staff.getCostSummary(),
      api.training.getLatestUpdate(),
      api.training.getAvailableUpdates(),
      api.game.getCurrent(),
    ])
      .then(([staff, preview, costs, latest, available, game]) => {
        setStaffList(staff);
        setTrainingPreview(preview);
        setCostSummary(costs);
        setLatestUpdate(latest);
        setAvailableUpdates(available);
        setCurrentGame(game);

        // Set default selection to current game week
        setSelectedSeason(game.season);
        setSelectedWeek(game.week);

        // Load assignments for each coach
        const coachIds = staff.map(s => s.id);
        Promise.all(coachIds.map(id => api.staff.getAssignments(id)))
          .then(assignmentLists => {
            const map = new Map<string, CoachAssignment[]>();
            coachIds.forEach((id, idx) => {
              map.set(id, assignmentLists[idx]);
            });
            setAssignments(map);
          });

        // Get team's stamina intensity
        if (team.id) {
          api.teams.getById(team.id).then(t => {
            setStaminaIntensity(t.staminaTrainingIntensity ?? 0.1);
          });
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [team?.id]);

  // Fetch training update when selection changes
  useEffect(() => {
    if (!team?.id) return;

    api.training.getUpdateBySeasonWeek(selectedSeason, selectedWeek)
      .then(update => setLatestUpdate(update))
      .catch(console.error);
  }, [selectedSeason, selectedWeek, team?.id]);

  const [localStaminaIntensity, setLocalStaminaIntensity] = useState(staminaIntensity);

  const handleStaminaIntensityChange = (newValue: number) => {
    setLocalStaminaIntensity(newValue);
  };

  const handleSaveStamina = async () => {
    if (!team?.id) return;
    setIsSaving(true);
    try {
      await api.teams.update(team.id, { staminaTrainingIntensity: localStaminaIntensity });
      setStaminaIntensity(localStaminaIntensity);
      setNotification({ message: t('training.staminaSaved'), type: 'success' });
    } catch (error) {
      console.error("Failed to update stamina intensity:", error);
      setNotification({ message: t('training.staminaSaveFailed'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignPlayer = async (coachId: string, playerId: string) => {
    try {
      await api.staff.assignPlayer(coachId, playerId);
      // Refresh assignments
      const newAssignments = await api.staff.getAssignments(coachId);
      setAssignments(prev => new Map(prev).set(coachId, newAssignments));
      // Refresh preview
      const preview = await api.training.getWeeklyPoints();
      setTrainingPreview(preview);
    } catch (error) {
      console.error("Failed to assign player:", error);
      const message = error instanceof Error ? error.message : t('training.assignFailed');
      setNotification({ message, type: 'error' });
    }
  };

  const handleUnassignPlayer = async (coachId: string, playerId: string) => {
    try {
      await api.staff.unassignPlayer(coachId, playerId);
      // Refresh assignments
      const newAssignments = await api.staff.getAssignments(coachId);
      setAssignments(prev => new Map(prev).set(coachId, newAssignments));
      // Refresh preview
      const preview = await api.training.getWeeklyPoints();
      setTrainingPreview(preview);
    } catch (error) {
      console.error("Failed to unassign player:", error);
      const message = error instanceof Error ? error.message : t('training.unassignFailed');
      setNotification({ message, type: 'error' });
    }
  };

  const handleUpdateTrainedSkill = async (coachId: string) => {
    setIsUpdatingSkill(true);
    try {
      const updatedStaff = await api.staff.updateTrainedSkill(coachId, newTrainedSkill);
      setStaffList(prev => prev.map(s => s.id === coachId ? updatedStaff : s));
      setEditingTrainedSkillCoachId(null);
      setNewTrainedSkill(null);
      setNotification({ message: t('training.updateSkillSuccess') || 'Skill updated', type: 'success' });
    } catch (error) {
      console.error("Failed to update trained skill:", error);
      const message = error instanceof Error ? error.message : 'Update failed';
      setNotification({ message, type: 'error' });
    } finally {
      setIsUpdatingSkill(false);
    }
  };

  const handleHireCoach = async () => {
    setIsHiring(true);
    try {
      const newStaff = await api.staff.hire(selectedCoachType, selectedLevel, selectedTrainedSkill);
      setStaffList(prev => [...prev, newStaff]);
      setShowHireModal(false);
      setSelectedTrainedSkill(undefined);
      // Refresh cost summary
      const costs = await api.staff.getCostSummary();
      setCostSummary(costs);
      setNotification({ message: t('training.hireSuccess'), type: 'success' });
    } catch (error) {
      console.error("Failed to hire coach:", error);
      const message = error instanceof Error ? error.message : t('training.hireFailed');
      setNotification({ message, type: 'error' });
    } finally {
      setIsHiring(false);
    }
  };

  const handleHireFitnessCoach = async () => {
    setIsHiring(true);
    try {
      const newStaff = await api.staff.hire("fitness_coach", selectedLevel);
      setStaffList(prev => [...prev, newStaff]);
      setShowHireFitnessModal(false);
      // Refresh cost summary
      const costs = await api.staff.getCostSummary();
      setCostSummary(costs);
      setNotification({ message: t('training.hireSuccess'), type: 'success' });
    } catch (error) {
      console.error("Failed to hire fitness coach:", error);
      const message = error instanceof Error ? error.message : t('training.hireFailed');
      setNotification({ message, type: 'error' });
    } finally {
      setIsHiring(false);
    }
  };

  const handleFireCoach = async (coachId: string) => {
    setIsFiring(true);
    try {
      await api.staff.fire(coachId);
      setStaffList(prev => prev.filter(s => s.id !== coachId));
      setAssignments(prev => {
        const next = new Map(prev);
        next.delete(coachId);
        return next;
      });
      // Refresh training preview since assignments changed
      const preview = await api.training.getWeeklyPoints();
      setTrainingPreview(preview);
      // Clear pending assignments and removals for this coach
      setPendingAssignments(prev => {
        const next = new Map(prev);
        next.delete(coachId);
        return next;
      });
      setPendingRemovals(prev => {
        const next = new Set(prev);
        for (const key of next) {
          if (key.startsWith(`${coachId}::`)) {
            next.delete(key);
          }
        }
        return next;
      });
      setShowFireConfirm(null);
      // Refresh cost summary
      const costs = await api.staff.getCostSummary();
      setCostSummary(costs);
      setNotification({ message: t('training.fireSuccess'), type: 'success' });
    } catch (error) {
      console.error("Failed to fire coach:", error);
      const message = error instanceof Error ? error.message : t('training.fireFailed');
      setNotification({ message, type: 'error' });
    } finally {
      setIsFiring(false);
    }
  };

  const handleUpgradeFitnessCoach = async () => {
    if (!fitnessCoach) return;
    setIsUpgrading(true);
    try {
      // Fire current fitness coach and hire new one at selected level
      await api.staff.fire(fitnessCoach.id);
      const newStaff = await api.staff.hire("fitness_coach", selectedLevel);
      setStaffList(prev => [...prev.filter(s => s.id !== fitnessCoach.id), newStaff]);
      setShowUpgradeFitnessModal(false);
      // Refresh cost summary
      const costs = await api.staff.getCostSummary();
      setCostSummary(costs);
      setNotification({ message: t('training.upgradeSuccess'), type: 'success' });
    } catch (error) {
      console.error("Failed to upgrade fitness coach:", error);
      const message = error instanceof Error ? error.message : t('training.upgradeFailed');
      setNotification({ message, type: 'error' });
    } finally {
      setIsUpgrading(false);
    }
  };

  // Specialized coaches exclude fitness coach
  const specializedCoaches = staffList.filter(s =>
    ["psychology_coach", "technical_coach", "set_piece_coach", "goalkeeper_coach"].includes(s.role)
  );
  const fitnessCoach = staffList.find(s => s.role === "fitness_coach");

  // Get unassigned players (players not in any assignment, excluding pending additions)
  const allAssignedPlayerIds = new Set<string>();
  assignments.forEach(list => {
    list.forEach(a => allAssignedPlayerIds.add(a.playerId));
  });
  // Also add pending additions
  pendingAssignments.forEach(playerIds => {
    playerIds.forEach(id => allAssignedPlayerIds.add(id));
  });
  const unassignedPlayers = trainingPreview.filter(p => !allAssignedPlayerIds.has(p.playerId) && p.weeklyPoints === 0);

  // Get players assigned to a specific coach
  const getPlayersForCoach = (coachId: string) => {
    const coachAssignments = assignments.get(coachId) || [];
    return coachAssignments.map(a => {
      const preview = trainingPreview.find(p => p.playerId === a.playerId);
      return {
        ...a,
        weeklyPoints: preview?.weeklyPoints || 0,
      };
    });
  };

  const levelColors = [
    'text-white',       // Lv1
    'text-green-400',   // Lv2
    'text-blue-400',    // Lv3
    'text-purple-400',  // Lv4
    'text-orange-400',  // Lv5
  ];

  const renderLevel = (level: number) => {
    return (
      <span className={`font-bold ${levelColors[level - 1] || 'text-white'}`}>
        Lv{level}
      </span>
    );
  };

  const canHireMoreCoaches = specializedCoaches.length < MAX_SPECIALIZED_COACHES;

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, player: { playerId: string; playerName: string; isGoalkeeper: boolean }) => {
    setDraggedPlayer(player);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedPlayer(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, coachId: string) => {
    e.preventDefault();
    if (draggedPlayer) {
      const coach = staffList.find(s => s.id === coachId);
      // Only block if isGoalkeeper is explicitly false (not undefined)
      if (coach?.role === 'goalkeeper_coach' && draggedPlayer.isGoalkeeper === false) {
        setNotification({
          type: 'error',
          message: t('training.cannotAssignGoalkeeper'),
        });
        setDraggedPlayer(null);
        return;
      }

      // Add to pending assignments
      setPendingAssignments(prev => {
        const next = new Map(prev);
        const coachPlayers = new Set(next.get(coachId) || []);
        coachPlayers.add(draggedPlayer.playerId);
        next.set(coachId, coachPlayers);
        return next;
      });
      setDraggedPlayer(null);
    }
  };

  // Handle unassign - may be current or pending
  const handleUnassign = (coachId: string, playerId: string) => {
    const currentAssignments = assignments.get(coachId)?.map(a => a.playerId) || [];
    const isCurrent = currentAssignments.includes(playerId);
    const isPendingAdd = pendingAssignments.get(coachId)?.has(playerId) || false;

    if (isPendingAdd) {
      // Remove from pending additions
      setPendingAssignments(prev => {
        const next = new Map(prev);
        const coachPlayers = next.get(coachId);
        if (coachPlayers) {
          coachPlayers.delete(playerId);
          if (coachPlayers.size === 0) {
            next.delete(coachId);
          }
        }
        return next;
      });
    } else if (isCurrent) {
      // Add to pending removals
      setPendingRemovals(prev => new Set(prev).add(pendingKey(coachId, playerId)));
    }
  };

  // Save pending assignments
  const saveAssignments = async () => {
    if (pendingAssignments.size === 0 && pendingRemovals.size === 0) return;
    setIsSaving(true);
    try {
      // Process removals first
      for (const key of pendingRemovals) {
        const [coachId, playerId] = parsePendingKey(key);
        await api.staff.unassignPlayer(coachId, playerId);
      }
      // Process additions
      for (const [coachId, playerIds] of pendingAssignments) {
        for (const playerId of playerIds) {
          await api.staff.assignPlayer(coachId, playerId);
        }
      }
      // Refresh assignments
      const coachIds = staffList.map(s => s.id);
      const assignmentLists = await Promise.all(coachIds.map(id => api.staff.getAssignments(id)));
      const map = new Map<string, CoachAssignment[]>();
      coachIds.forEach((id, idx) => {
        map.set(id, assignmentLists[idx]);
      });
      setAssignments(map);
      setPendingAssignments(new Map());
      setPendingRemovals(new Set());
      // Refresh preview
      const preview = await api.training.getWeeklyPoints();
      setTrainingPreview(preview);
      setNotification({ message: t('training.assignmentsSaved'), type: 'success' });
    } catch (error) {
      console.error("Failed to save assignments:", error);
      setNotification({ message: t('training.assignmentsSaveFailed'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel pending changes
  const cancelPending = () => {
    setPendingAssignments(new Map());
    setPendingRemovals(new Set());
  };

  // Get displayed assignments (current + pending additions - pending removals for a coach)
  const getDisplayedPlayers = (coachId: string): CoachPlayerWithGK[] => {
    const current = assignments.get(coachId) || [];
    const pendingAddIds = pendingAssignments.get(coachId) || new Set();

    // Filter out removals
    const toRemove = new Set(
      Array.from(pendingRemovals)
        .filter(k => k.startsWith(`${coachId}::`))
        .map(k => parsePendingKey(k)[1])
    );

    // Current players minus pending removals (with isGoalkeeper from trainingPreview)
    const currentAfterRemovals: CoachPlayerWithGK[] = current
      .filter(a => !toRemove.has(a.playerId))
      .map(a => {
        const preview = trainingPreview.find(p => p.playerId === a.playerId);
        return { ...a, isGoalkeeper: preview?.isGoalkeeper || false };
      });

    // Pending additions as CoachPlayerWithGK objects
    const pendingAsAssignments: CoachPlayerWithGK[] = Array.from(pendingAddIds).map(playerId => {
      const preview = trainingPreview.find(p => p.playerId === playerId);
      return {
        id: `pending-${playerId}`,
        playerId,
        coachId,
        playerName: preview?.playerName || playerId,
        trainingCategory: 'pending',
        assignedAt: new Date().toISOString(),
        isGoalkeeper: preview?.isGoalkeeper || false,
      };
    });

    return [...currentAfterRemovals, ...pendingAsAssignments];
  };

  // Check if a player is pending removal
  const isPendingRemoval = (coachId: string, playerId: string) => {
    return pendingRemovals.has(pendingKey(coachId, playerId));
  };

  // Check if a player is pending addition
  const isPendingAddition = (coachId: string, playerId: string) => {
    return pendingAssignments.get(coachId)?.has(playerId) || false;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-20 right-5 z-[200] flex flex-col">
          <div className={`
            relative overflow-hidden rounded-2xl border backdrop-blur-2xl
            ${notification.type === 'success'
              ? 'bg-[#002c22]/95 border-[#a1ffc2]/30 shadow-[0_0_30px_rgba(161,255,194,0.15)]'
              : 'bg-[#2a1515]/95 border-red-500/30 shadow-[0_0_30px_rgba(255,100,100,0.1)]'
            }
          `}>
            {/* Accent line */}
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${
              notification.type === 'success' ? 'bg-[#a1ffc2]' : 'bg-red-500'
            }`} />

            {/* Content */}
            <div className="flex items-center gap-4 px-5 py-4 pl-6">
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                ${notification.type === 'success'
                  ? 'bg-[#a1ffc2]/10 text-[#a1ffc2]'
                  : 'bg-red-500/10 text-red-400'
                }
              `}>
                <span className="material-symbols-outlined text-xl">
                  {notification.type === 'success' ? 'check_circle' : 'error'}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  notification.type === 'success' ? 'text-[#d3f5e8]' : 'text-red-200'
                }`}>
                  {notification.message}
                </p>
              </div>

              <button
                onClick={() => setNotification(null)}
                className={`
                  w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                  transition-all duration-200 hover:scale-110
                  ${notification.type === 'success'
                    ? 'text-[#91b2a6] hover:text-[#d3f5e8] hover:bg-[#a1ffc2]/10'
                    : 'text-red-400/60 hover:text-red-300 hover:bg-red-500/10'
                  }
                `}
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="mb-6">
        <div>
          <h1 className="text-4xl font-headline font-bold text-on-surface tracking-tight mb-1">
            {t('training.title')}
          </h1>
          <p className="text-sm text-on-surface-variant font-body">
            {t('training.subtitle')}
          </p>
        </div>
      </header>

      {/* Stamina Training Intensity */}
      <div className="bg-surface-container-low rounded-DEFAULT border border-outline-variant/15 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.4)] mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-headline font-bold text-on-surface">{t('training.staminaTraining')}</h3>
          {!fitnessCoach ? (
            <button
              onClick={() => setShowHireFitnessModal(true)}
              className="px-3 py-1.5 bg-primary text-on-primary rounded-DEFAULT font-medium text-xs hover:bg-primary/90 transition-colors"
            >
              + {t('training.hireFitnessCoach')}
            </button>
          ) : (
            <button
              onClick={() => {
                setSelectedLevel(fitnessCoach.level);
                setShowUpgradeFitnessModal(true);
              }}
              className="px-3 py-1.5 bg-green-600/80 text-white rounded-DEFAULT font-medium text-xs hover:bg-green-600 transition-colors"
            >
              {t('training.changeLevel')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-6">
          {/* Fitness Coach Info - Left Side */}
          {fitnessCoach ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-600/20 border-2 border-green-500/30 flex items-center justify-center">
                <span className="text-xl font-bold text-green-400">{fitnessCoach.name.charAt(0)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-on-surface">{fitnessCoach.name}</span>
                <div className="flex items-center gap-2">
                  {renderLevel(fitnessCoach.level)}
                  <span className="text-[10px] text-on-surface-variant">
                    · {t('training.expiresOn', { date: formatDate(fitnessCoach.contractExpiry) })}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-[72px]" /> /* Placeholder for alignment */
          )}

          {/* Intensity Slider */}
          <div className="flex-1 flex items-center gap-4">
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={localStaminaIntensity}
              onChange={(e) => handleStaminaIntensityChange(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-surface-container-highest rounded-full appearance-none cursor-pointer"
            />
            <span className="text-2xl font-bold text-primary w-16 text-right">{Math.round(localStaminaIntensity * 100)}%</span>
            <button
              onClick={handleSaveStamina}
              disabled={isSaving || localStaminaIntensity === staminaIntensity}
              className="px-4 py-1.5 bg-primary text-on-primary rounded-DEFAULT font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? t('training.saving') : t('training.save')}
            </button>
          </div>
        </div>
        <p className="text-xs text-on-surface-variant mt-2">
          {t('training.staminaDescription', { percent: Math.round((1 - staminaIntensity) * 100) })}
        </p>
      </div>

      {/* Main Content + Sidebar */}
      <div className="flex gap-6">
        {/* Left: Specialized Coaches */}
        <div className="flex-1 min-w-0 space-y-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-headline font-bold text-on-surface">{t('training.specializedCoaches')} ({specializedCoaches.length}/{MAX_SPECIALIZED_COACHES})</h2>
                {canHireMoreCoaches ? (
                  <button
                    onClick={() => { setShowHireModal(true); setSelectedTrainedSkill(undefined); }}
                    className="px-3 py-1.5 bg-primary text-on-primary rounded-DEFAULT font-medium text-xs hover:bg-primary/90 transition-colors"
                  >
                    + {t('training.hireSpecializedCoach')}
                  </button>
                ) : (
                  <span className="px-3 py-1.5 bg-surface-container text-on-surface-variant rounded-DEFAULT text-xs">
                    {t('training.coachesFull')}
                  </span>
                )}
              </div>
              {hasPendingChanges && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelPending}
                    className="px-3 py-1.5 bg-surface-container text-on-surface rounded-DEFAULT font-medium text-xs hover:bg-surface-container-highest transition-colors"
                  >
                    {t('training.cancel')}
                  </button>
                  <button
                    onClick={saveAssignments}
                    disabled={isSaving}
                    className="px-3 py-1.5 bg-primary text-on-primary rounded-DEFAULT font-medium text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? t('training.savingAssignments') : t('training.saveAssignments')}
                  </button>
                </div>
              )}
            </div>

            {specializedCoaches.length === 0 ? (
              <div className="bg-surface-container-low rounded-DEFAULT border border-outline-variant/15 p-8 text-center">
                <p className="text-on-surface-variant">{t('training.noSpecializedCoaches')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {specializedCoaches.map(coach => {
                  const displayedPlayers = getDisplayedPlayers(coach.id);
                  const roleLabel = STAFF_ROLE_LABELS[coach.role] || { labelEn: coach.role };
                  const remainingSlots = MAX_PLAYERS_PER_COACH - displayedPlayers.length;

                  return (
                    <div
                      key={coach.id}
                      className="bg-surface-container-low/75 backdrop-blur-xl border border-white/5 rounded-DEFAULT p-5 shadow-[0_12px_32px_rgba(0,0,0,0.4)] border border-outline-variant/15"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, coach.id)}
                    >
                      {/* Coach Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-sm font-bold text-on-surface border-2 border-surface-container">
                            {getInitials(coach.name)}
                          </div>
                          <div>
                            <h3 className="text-lg font-headline font-bold text-on-surface">{coach.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
                              <span className="px-1.5 py-0.5 bg-surface-container-low rounded text-[10px]">{roleLabel.labelEn}</span>
                              <span>· {formatDate(coach.contractExpiry)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right flex flex-col items-end">
                            <div className="mb-0.5">
                              {renderLevel(coach.level)}
                            </div>
                            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">Level</span>
                          </div>
                          <button
                            onClick={() => setShowFireConfirm(coach.id)}
                            className="p-1.5 text-error/70 hover:bg-error/10 hover:text-error rounded transition-colors"
                            title="Fire coach"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Trained Skill */}
                      <div className="mb-3">
                        <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1.5">
                          {locale === 'zh' ? '训练技能' : 'Trained Skill'}
                        </div>
                        {editingTrainedSkillCoachId === coach.id ? (
                          <div className="flex gap-2 items-center">
                            <select
                              value={newTrainedSkill ?? ''}
                              onChange={(e) => setNewTrainedSkill(e.target.value || null)}
                              className="flex-1 bg-surface-container-low border border-outline-variant/30 text-on-surface text-xs rounded px-2 py-1.5"
                            >
                              <option value="">{locale === 'zh' ? '随机' : 'Random'}</option>
                              {COACH_SKILLS[coach.role]?.map(skill => (
                                <option key={skill.value} value={skill.value}>
                                  {locale === 'zh' ? skill.label : skill.labelEn}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleUpdateTrainedSkill(coach.id)}
                              disabled={isUpdatingSkill}
                              className="px-2 py-1.5 bg-primary text-on-primary text-xs rounded hover:bg-primary/90 disabled:opacity-50"
                            >
                              {locale === 'zh' ? '保存' : 'Save'}
                            </button>
                            <button
                              onClick={() => { setEditingTrainedSkillCoachId(null); setNewTrainedSkill(null); }}
                              className="px-2 py-1.5 bg-surface-container-low text-on-surface text-xs rounded hover:bg-surface-container"
                            >
                              {locale === 'zh' ? '取消' : 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              coach.trainedSkill
                                ? 'bg-[#a1ffc2]/10 text-[#a1ffc2] border border-[#a1ffc2]/30'
                                : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/20'
                            }`}>
                              {coach.trainedSkill
                                ? getSkillLabel(coach.trainedSkill, locale)
                                : (locale === 'zh' ? '随机' : 'Random')}
                            </span>
                            <button
                              onClick={() => { setEditingTrainedSkillCoachId(coach.id); setNewTrainedSkill(coach.trainedSkill ?? null); }}
                              className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low rounded transition-colors"
                              title={locale === 'zh' ? '更换技能' : 'Change skill'}
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Assigned Players - 3 Rounded Square Slots */}
                      <div className="mb-3">
                        <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-2">
                          {t('training.assignedPlayers', { current: displayedPlayers.length, max: MAX_PLAYERS_PER_COACH })}
                        </div>
                        <div className="flex gap-2">
                          {/* Player slots */}
                          {displayedPlayers.map((player) => {
                            const pendingRemoval = isPendingRemoval(coach.id, player.playerId);
                            const pendingAdd = isPendingAddition(coach.id, player.playerId);
                            return (
                              <div
                                key={player.id}
                                draggable={!pendingRemoval}
                                onDragStart={(e) => handleDragStart(e, player)}
                                onDragEnd={handleDragEnd}
                                className={`flex-1 aspect-square rounded-2xl border flex flex-col items-center justify-center p-2 cursor-grab active:cursor-grabbing transition-colors relative group ${
                                  pendingRemoval
                                    ? 'bg-error/20 border-error/50 opacity-60'
                                    : pendingAdd
                                      ? 'bg-primary/20 border-primary/50'
                                      : 'bg-surface-container-lowest border-outline-variant/10 hover:bg-surface-container-high'
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-2xl flex items-center justify-center text-[10px] font-bold mb-1 ${
                                  pendingRemoval
                                    ? 'bg-error/30 text-error'
                                    : pendingAdd
                                      ? 'bg-primary/30 text-primary'
                                      : 'bg-surface-container text-on-surface'
                                }`}>
                                  {getInitials(player.playerName)}
                                </div>
                                <span className="text-[10px] font-medium text-on-surface truncate w-full text-center px-1">{player.playerName}</span>
                                <button
                                  onClick={() => handleUnassign(coach.id, player.playerId)}
                                  className="absolute -top-1 -right-1 p-1 text-error/70 hover:bg-error/10 hover:text-error rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <span className="material-symbols-outlined text-[4px]">delete</span>
                                </button>
                              </div>
                            );
                          })}
                          {/* Empty slots */}
                          {Array.from({ length: remainingSlots }).map((_, i) => (
                            <div
                              key={`empty-${i}`}
                              className="flex-1 aspect-square border-2 border-dashed border-outline-variant/30 rounded-2xl flex flex-col items-center justify-center text-[10px] text-on-surface-variant/50"
                            >
                              <span className="material-symbols-outlined text-base">add</span>
                              <span>{t('training.dragPlayer')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Weekly Training Update - Below Specialized Coaches */}
          {latestUpdate && latestUpdate.playerUpdates.length > 0 ? (
            <div className="relative overflow-hidden rounded-DEFAULT border border-[#a1ffc2]/20 bg-gradient-to-br from-[#001a14] to-[#002219] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#a1ffc2]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#abf853]/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

              {/* Header with selector */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#a1ffc2]/10 border border-[#a1ffc2]/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#a1ffc2] text-lg">trending_up</span>
                  </div>
                  <div>
                    <h3 className="text-base font-headline font-bold text-[#a1ffc2]">
                      {t('training.weeklyUpdate')}
                    </h3>
                    <p className="text-xs text-[#91b2a6]">
                      {t('league.season')} {latestUpdate.season} · {t('training.week')} {latestUpdate.week}
                    </p>
                  </div>
                </div>
                {/* Season/Week Selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      const season = parseInt(e.target.value);
                      setSelectedSeason(season);
                      setSelectedWeek(1);
                    }}
                    className="bg-[#00251c] border border-[#2f4e44]/50 text-[#a1ffc2] text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#a1ffc2]/50"
                  >
                    {[...new Set([1, currentGame.season, ...availableUpdates.map(u => u.season)])].sort((a, b) => a - b).map((s) => (
                      <option key={s} value={s}>{t('league.season')} {s}</option>
                    ))}
                  </select>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                    className="bg-[#00251c] border border-[#2f4e44]/50 text-[#a1ffc2] text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#a1ffc2]/50"
                  >
                    {Array.from({ length: getMaxWeekForSeason(selectedSeason) }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w}>{t('training.week')} {w}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Player updates - stacked rows */}
              <div className="space-y-3">
                {latestUpdate.playerUpdates.map((update) => (
                  <div key={update.playerId} className="flex items-center gap-4 p-4 rounded-xl bg-[#00251c]/50 border border-[#2f4e44]/30">
                    {/* Large Player avatar */}
                    <Link href={`/${locale}/players/${update.playerId}`} className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#003520] to-[#00251c] border border-[#2f4e44]/50 flex items-center justify-center shrink-0 hover:ring-2 hover:ring-[#a1ffc2]/50 transition-all">
                      <span className="text-lg font-bold text-[#a1ffc2]">
                        {getInitials(update.playerName)}
                      </span>
                    </Link>
                    {/* Player name - clickable link */}
                    <div className="w-40 shrink-0">
                      <Link href={`/${locale}/players/${update.playerId}`} className="text-sm font-semibold text-white hover:text-[#a1ffc2] hover:underline transition-colors">
                        {update.playerName}
                      </Link>
                    </div>
                    {/* Changes */}
                    <div className="flex-1 flex flex-wrap gap-2">
                      {update.changes.map((change, idx) => {
                        const fieldKey = change.field.startsWith('skill:')
                          ? change.field.replace('skill:', '')
                          : change.field === 'stamina'
                            ? 'stamina'
                            : change.field === 'form'
                              ? 'form'
                              : change.field;
                        const isUp = change.newValue > change.oldValue;
                        const colors: Record<string, string> = {
                          stamina: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                          form: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                        };
                        const colorClass = colors[fieldKey] || 'bg-[#a1ffc2]/20 text-[#a1ffc2] border-[#a1ffc2]/30';
                        const icon = isUp ? '↑' : '↓';

                        // Stamina levels (1-5)
                        const staminaLevels: Record<number, { zh: string; en: string }> = {
                          1: { zh: '空槽', en: 'Empty' },
                          2: { zh: '气喘', en: 'Winded' },
                          3: { zh: '平稳', en: 'Steady' },
                          4: { zh: '充沛', en: 'Vibrant' },
                          5: { zh: '无限', en: 'Bottomless' },
                        };

                        // Form levels (1-5)
                        const formLevels: Record<number, { zh: string; en: string }> = {
                          1: { zh: '失魂', en: 'Lost' },
                          2: { zh: '冰冷', en: 'Cold' },
                          3: { zh: '稳定', en: 'Stable' },
                          4: { zh: '火热', en: 'Hot' },
                          5: { zh: '巅峰', en: 'Peak' },
                        };

                        // Skill level names (1-20)
                        const skillLevels: Record<number, { zh: string; en: string }> = {
                          1: { zh: '差劲', en: 'Terrible' },
                          2: { zh: '欠缺', en: 'Deficient' },
                          3: { zh: '入门', en: 'Novice' },
                          4: { zh: '平庸', en: 'Mediocre' },
                          5: { zh: '熟练', en: 'Proficient' },
                          6: { zh: '粗通', en: 'Basic' },
                          7: { zh: '扎实', en: 'Solid' },
                          8: { zh: '优秀', en: 'Excellent' },
                          9: { zh: '杰出', en: 'Outstanding' },
                          10: { zh: '精湛', en: 'Skilled' },
                          11: { zh: '超群', en: 'Superlative' },
                          12: { zh: '职业级', en: 'Professional' },
                          13: { zh: '卓越', en: 'Exceptional' },
                          14: { zh: '精英级', en: 'Elite' },
                          15: { zh: '统治级', en: 'Dominant' },
                          16: { zh: '大师级', en: 'Master' },
                          17: { zh: '宗师', en: 'Grand Master' },
                          18: { zh: '王牌', en: 'Ace' },
                          19: { zh: '传奇级', en: 'Legendary' },
                          20: { zh: '超凡入圣', en: 'Transcendent' },
                        };

                        // Field labels
                        const fieldLabels: Record<string, { zh: string; en: string }> = {
                          stamina: { zh: '体能', en: 'Stamina' },
                          form: { zh: '状态', en: 'Form' },
                          pace: { zh: '速度', en: 'Pace' },
                          strength: { zh: '力量', en: 'Strength' },
                          finishing: { zh: '射门', en: 'Finishing' },
                          passing: { zh: '传球', en: 'Passing' },
                          dribbling: { zh: '盘带', en: 'Dribbling' },
                          defending: { zh: '防守', en: 'Defending' },
                          positioning: { zh: '跑位', en: 'Positioning' },
                          composure: { zh: '冷静', en: 'Composure' },
                          freeKicks: { zh: '任意球', en: 'Free Kicks' },
                          penalties: { zh: '点球', en: 'Penalties' },
                          reflexes: { zh: '反应', en: 'Reflexes' },
                          handling: { zh: '扑救', en: 'Handling' },
                          aerial: { zh: '空中', en: 'Aerial' },
                        };

                        const isStamina = fieldKey === 'stamina';
                        const isForm = fieldKey === 'form';
                        const isSkill = !isStamina && !isForm;

                        const fieldLabel = fieldLabels[fieldKey] || { zh: fieldKey, en: fieldKey };
                        const oldLabel = isSkill
                          ? skillLevels[change.oldValue]?.[locale === 'zh' ? 'zh' : 'en'] || change.oldValue
                          : isStamina
                            ? staminaLevels[change.oldValue]?.[locale === 'zh' ? 'zh' : 'en'] || change.oldValue
                            : formLevels[change.oldValue]?.[locale === 'zh' ? 'zh' : 'en'] || change.oldValue;
                        const newLabel = isSkill
                          ? skillLevels[change.newValue]?.[locale === 'zh' ? 'zh' : 'en'] || change.newValue
                          : isStamina
                            ? staminaLevels[change.newValue]?.[locale === 'zh' ? 'zh' : 'en'] || change.newValue
                            : formLevels[change.newValue]?.[locale === 'zh' ? 'zh' : 'en'] || change.newValue;

                        return (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${colorClass}`}
                          >
                            <span className="opacity-70">{locale === 'zh' ? fieldLabel.zh : fieldLabel.en}</span>
                            <span>{oldLabel}</span>
                            <span className={isUp ? 'text-emerald-300' : 'text-red-400'}>{icon}</span>
                            <span>{newLabel}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-DEFAULT border border-outline-variant/15 bg-gradient-to-br from-[#001a14] to-[#002219] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              {/* Header for empty state */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#a1ffc2]/10 border border-[#a1ffc2]/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#a1ffc2] text-lg">trending_up</span>
                  </div>
                  <div>
                    <h3 className="text-base font-headline font-bold text-[#a1ffc2]">
                      {t('training.weeklyUpdate')}
                    </h3>
                    <p className="text-xs text-[#91b2a6]">
                      {t('league.season')} {selectedSeason} · {t('training.week')} {selectedWeek}
                    </p>
                  </div>
                </div>
                {/* Season/Week Selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      const season = parseInt(e.target.value);
                      setSelectedSeason(season);
                      setSelectedWeek(1);
                    }}
                    className="bg-[#00251c] border border-[#2f4e44]/50 text-[#a1ffc2] text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#a1ffc2]/50"
                  >
                    {[...new Set([1, currentGame.season, ...availableUpdates.map(u => u.season)])].sort((a, b) => a - b).map((s) => (
                      <option key={s} value={s}>{t('league.season')} {s}</option>
                    ))}
                  </select>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                    className="bg-[#00251c] border border-[#2f4e44]/50 text-[#a1ffc2] text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#a1ffc2]/50"
                  >
                    {Array.from({ length: getMaxWeekForSeason(selectedSeason) }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w}>{t('training.week')} {w}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Empty state */}
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="material-symbols-outlined text-4xl text-[#91b2a6]/50 mb-2">info</span>
                <p className="text-sm text-[#91b2a6]">{t('training.noUpdates')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Unassigned Players Sidebar */}
        <div className="w-[280px] shrink-0">
          <div className="bg-surface-container rounded-DEFAULT overflow-hidden h-[calc(100vh-280px)] sticky top-6">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-headline font-bold text-on-surface">{t('training.unassignedPlayers')}</h3>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar" style={{ maxHeight: "calc(100vh - 340px)" }}>
              {unassignedPlayers.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-4">{t('training.allPlayersAssigned')}</p>
              ) : (
                unassignedPlayers.map(player => {
                  const isExpanded = expandedPlayerId === player.playerId;
                  return (
                    <div key={player.playerId}>
                      {/* Expandable card */}
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          handleDragStart(e, player);
                        }}
                        onDragEnd={(e) => {
                          e.stopPropagation();
                          handleDragEnd();
                        }}
                        onPointerUp={(e) => {
                          e.stopPropagation();
                          setExpandedPlayerId(isExpanded ? null : player.playerId);
                        }}
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <PlayerStatsCard
                          player={{
                            name: player.playerName,
                            age: player.age,
                            stamina: player.stamina,
                            condition: player.condition,
                            experience: player.experience,
                            pwi: player.pwi,
                          }}
                          skillBreakdown={player.skillBreakdown}
                          compact={true}
                          compactShowSkills={false}
                          locale={locale}
                        />
                      </div>
                      {/* Expanded Skills */}
                      {isExpanded && player.skillBreakdown && player.skillBreakdown.length > 0 && (
                        <div className="mt-2 p-3 bg-[#001711] rounded-xl border border-[#2f4e44]/20">
                          {/* Skills Grid - 4 columns */}
                          <div className="grid grid-cols-2 gap-4">
                            {['physical', 'technical', 'mental', 'setPieces'].map(cat => {
                              const catSkills = player.skillBreakdown?.filter(s => s.category === cat) || [];
                              if (catSkills.length === 0) return null;
                              const catColors: Record<string, string> = {
                                physical: 'text-[#abf853]',
                                technical: 'text-[#a1ffc2]',
                                mental: 'text-[#f59e0b]',
                                setPieces: 'text-[#ec4899]',
                              };
                              const catColor = catColors[cat] || 'text-[#a1ffc2]';
                              return (
                                <div key={cat}>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <div className={`w-1 h-3 rounded-full ${catColor.replace('text-', 'bg-')}`} />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-[#91b2a6]">
                                      {cat === 'physical' ? (locale === 'zh' ? '体能' : 'Physical') :
                                       cat === 'technical' ? (locale === 'zh' ? '技术' : 'Technical') :
                                       cat === 'mental' ? (locale === 'zh' ? '心智' : 'Mental') :
                                       (locale === 'zh' ? '定位球' : 'Set Pieces')}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {catSkills.map(sk => {
                                      const pct = (sk.current / 20) * 100;
                                      return (
                                        <div key={sk.skill} className="space-y-1">
                                          <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-[#91b2a6]">
                                            <span>{sk.skill.charAt(0).toUpperCase() + sk.skill.slice(1)}</span>
                                            <span className={catColor}>{Math.floor(sk.current)}/{Math.floor(sk.potential)}</span>
                                          </div>
                                          <div className="h-1 w-full bg-[#00251c] rounded-full overflow-hidden">
                                            <div
                                              className={`h-full ${catColor.replace('text-', 'bg-')} rounded-full`}
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hire Specialized Coach Modal */}
      {showHireModal && costSummary && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowHireModal(false)}>
          <div className="bg-surface-container-high rounded-DEFAULT p-6 w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-headline font-bold text-on-surface mb-6">{t('training.hireSpecializedCoach')}</h2>

            {/* Coach Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-on-surface-variant mb-2">{t('training.coachType')}</label>
              <div className="grid grid-cols-1 gap-2">
                {SPECIALIZED_COACH_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => { setSelectedCoachType(type.value); setSelectedTrainedSkill(undefined); }}
                    className={`p-3 rounded-DEFAULT text-left text-sm transition-colors ${
                      selectedCoachType === type.value
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {type.label} ({type.labelEn})
                  </button>
                ))}
              </div>
            </div>

            {/* Trained Skill Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-on-surface-variant mb-2">
                {locale === 'zh' ? '训练技能（可选）' : 'Trained Skill (Optional)'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {/* No specific skill option */}
                <button
                  onClick={() => setSelectedTrainedSkill(undefined)}
                  className={`p-2 rounded-DEFAULT text-center text-sm transition-colors ${
                    selectedTrainedSkill === undefined
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {locale === 'zh' ? '随机' : 'Random'}
                </button>
                {COACH_SKILLS[selectedCoachType]?.map(skill => (
                  <button
                    key={skill.value}
                    onClick={() => setSelectedTrainedSkill(skill.value)}
                    className={`p-2 rounded-DEFAULT text-center text-sm transition-colors ${
                      selectedTrainedSkill === skill.value
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {locale === 'zh' ? skill.label : skill.labelEn}
                  </button>
                ))}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                {locale === 'zh' ? '不选择则随机训练该类别的技能' : 'Leave empty to train random skill in category'}
              </p>
            </div>

            {/* Level */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-on-surface-variant mb-2">{t('training.coachLevel')}</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(level => (
                  <button
                    key={level}
                    onClick={() => setSelectedLevel(level)}
                    className={`flex-1 p-3 rounded-DEFAULT text-center transition-colors ${
                      selectedLevel === level
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <div className="text-xs font-medium">Lv.{level}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cost Info */}
            <div className="bg-surface-container-low rounded-DEFAULT p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">{t('training.signingFee')}:</span>
                <span className="text-on-surface font-medium">${costSummary.signingFeesByLevel[selectedLevel]?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">{t('training.weeklySalary')}:</span>
                <span className="text-on-surface font-medium">${costSummary.salaryByLevel[selectedLevel]?.toLocaleString() || 0}/周</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowHireModal(false)}
                className="flex-1 px-4 py-2 bg-surface-container text-on-surface rounded-DEFAULT font-medium text-sm hover:bg-surface-container-high transition-colors"
                disabled={isHiring}
              >
                {t('training.cancel')}
              </button>
              <button
                onClick={handleHireCoach}
                className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-DEFAULT font-medium text-sm hover:bg-primary/90 transition-colors"
                disabled={isHiring}
              >
                {isHiring ? t('training.hiring') : t('training.hire')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hire Fitness Coach Modal */}
      {showHireFitnessModal && costSummary && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowHireFitnessModal(false)}>
          <div className="bg-surface-container-high rounded-DEFAULT p-6 w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-headline font-bold text-on-surface mb-6">{t('training.hireFitnessCoach')}</h2>

            {/* Level */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-on-surface-variant mb-2">{t('training.coachLevel')}</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(level => (
                  <button
                    key={level}
                    onClick={() => setSelectedLevel(level)}
                    className={`flex-1 p-3 rounded-DEFAULT text-center transition-colors ${
                      selectedLevel === level
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <div className="text-xs font-medium">Lv.{level}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cost Info */}
            <div className="bg-surface-container-low rounded-DEFAULT p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">{t('training.signingFee')}:</span>
                <span className="text-on-surface font-medium">${costSummary.signingFeesByLevel[selectedLevel]?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">{t('training.weeklySalary')}:</span>
                <span className="text-on-surface font-medium">${costSummary.salaryByLevel[selectedLevel]?.toLocaleString() || 0}/周</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowHireFitnessModal(false)}
                className="flex-1 px-4 py-2 bg-surface-container text-on-surface rounded-DEFAULT font-medium text-sm hover:bg-surface-container-high transition-colors"
                disabled={isHiring}
              >
                {t('training.cancel')}
              </button>
              <button
                onClick={handleHireFitnessCoach}
                className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-DEFAULT font-medium text-sm hover:bg-primary/90 transition-colors"
                disabled={isHiring}
              >
                {isHiring ? t('training.hiring') : t('training.hire')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Fitness Coach Modal */}
      {showUpgradeFitnessModal && costSummary && fitnessCoach && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowUpgradeFitnessModal(false)}>
          <div className="bg-surface-container-high rounded-DEFAULT p-6 w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-headline font-bold text-on-surface mb-6">{t('training.changeFitnessCoachLevel')}</h2>

            {/* Current Level Info */}
            <div className="bg-surface-container-low rounded-DEFAULT p-4 mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-on-surface-variant">Current:</span>
                <span className="text-on-surface font-medium">Lv.{fitnessCoach.level} (${costSummary.salaryByLevel[fitnessCoach.level]?.toLocaleString() || 0}/week)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">{t('training.signingFee')}:</span>
                <span className="text-on-surface font-medium">${(costSummary.signingFeesByLevel[selectedLevel] || 0).toLocaleString()}</span>
              </div>
            </div>

            {/* Level Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-on-surface-variant mb-2">{t('training.coachLevel')}</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(level => (
                  <button
                    key={level}
                    onClick={() => setSelectedLevel(level)}
                    className={`flex-1 p-3 rounded-DEFAULT text-center transition-colors ${
                      selectedLevel === level
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <div className="text-xs font-medium">Lv.{level}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* New Cost Info */}
            <div className="bg-surface-container-low rounded-DEFAULT p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">{t('training.signingFee')}:</span>
                <span className="text-on-surface font-medium">${(costSummary.signingFeesByLevel[selectedLevel] || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">{t('training.weeklySalary')}:</span>
                <span className="text-on-surface font-medium">${(costSummary.salaryByLevel[selectedLevel] || 0).toLocaleString()}/周</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowUpgradeFitnessModal(false)}
                className="flex-1 px-4 py-2 bg-surface-container text-on-surface rounded-DEFAULT font-medium text-sm hover:bg-surface-container-high transition-colors"
                disabled={isUpgrading}
              >
                {t('training.cancel')}
              </button>
              <button
                onClick={handleUpgradeFitnessCoach}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-DEFAULT font-medium text-sm hover:bg-green-600/90 transition-colors"
                disabled={isUpgrading || selectedLevel === fitnessCoach.level}
              >
                {isUpgrading ? t('training.hiring') : t('training.confirmUpgrade')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fire Coach Confirmation */}
      {showFireConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowFireConfirm(null)}>
          <div className="bg-surface-container-high rounded-DEFAULT p-6 w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-headline font-bold text-on-surface mb-2">{t('training.fireCoach')}</h2>
            <p className="text-on-surface-variant text-sm mb-6">
              {t('training.fireCoachConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFireConfirm(null)}
                className="flex-1 px-4 py-2 bg-surface-container text-on-surface rounded-DEFAULT font-medium text-sm hover:bg-surface-container-high transition-colors"
                disabled={isFiring}
              >
                {t('training.cancel')}
              </button>
              <button
                onClick={() => handleFireCoach(showFireConfirm)}
                className="flex-1 px-4 py-2 bg-error text-on-error rounded-DEFAULT font-medium text-sm hover:bg-error/90 transition-colors"
                disabled={isFiring}
              >
                {isFiring ? t('training.firing') : t('training.confirmFire')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
