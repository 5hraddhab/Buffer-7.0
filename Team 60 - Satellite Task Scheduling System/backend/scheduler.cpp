#include <algorithm>
#include <functional>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <queue>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

using namespace std;

enum class RiskLevel { LOW = 1, MEDIUM = 2, HIGH = 3 };
enum class PollutionType { PLASTIC = 1, OIL_SPILL = 2, INDUSTRIAL = 3, CHEMICAL = 4, UNKNOWN = 5 };

string trim(const string& value) {
    size_t start = value.find_first_not_of(" \t\r\n");
    if (start == string::npos) return "";
    size_t end = value.find_last_not_of(" \t\r\n");
    return value.substr(start, end - start + 1);
}

string toLowerStr(string value) {
    transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(tolower(c));
    });
    return value;
}

string riskToStr(RiskLevel risk) {
    switch (risk) {
        case RiskLevel::HIGH: return "High";
        case RiskLevel::MEDIUM: return "Medium";
        default: return "Low";
    }
}

string pollutionToStr(PollutionType pollutionType) {
    switch (pollutionType) {
        case PollutionType::PLASTIC: return "Plastic";
        case PollutionType::OIL_SPILL: return "Oil Spill";
        case PollutionType::INDUSTRIAL: return "Industrial";
        case PollutionType::CHEMICAL: return "Chemical";
        default: return "Unknown";
    }
}

RiskLevel parseRiskLevel(const string& value) {
    string normalized = toLowerStr(trim(value));
    if (normalized == "high") return RiskLevel::HIGH;
    if (normalized == "medium") return RiskLevel::MEDIUM;
    return RiskLevel::LOW;
}

PollutionType parsePollutionType(const string& value) {
    string normalized = toLowerStr(trim(value));
    if (normalized == "plastic") return PollutionType::PLASTIC;
    if (normalized == "oil spill" || normalized == "oil_spill" || normalized == "oilspill") return PollutionType::OIL_SPILL;
    if (normalized == "industrial") return PollutionType::INDUSTRIAL;
    if (normalized == "chemical") return PollutionType::CHEMICAL;
    return PollutionType::UNKNOWN;
}

vector<string> splitEscaped(const string& value, char delimiter) {
    vector<string> parts;
    string current;
    bool escaping = false;

    for (char c : value) {
        if (escaping) {
            if (c == 'p') current.push_back('|');
            else if (c == 'c') current.push_back(',');
            else current.push_back(c);
            escaping = false;
            continue;
        }

        if (c == '\\') {
            escaping = true;
            continue;
        }

        if (c == delimiter) {
            parts.push_back(current);
            current.clear();
            continue;
        }

        current.push_back(c);
    }

    parts.push_back(current);
    return parts;
}

string jsonEscape(const string& value) {
    string escaped;
    for (char c : value) {
        switch (c) {
            case '\\': escaped += "\\\\"; break;
            case '"': escaped += "\\\""; break;
            case '\n': escaped += "\\n"; break;
            case '\r': escaped += "\\r"; break;
            case '\t': escaped += "\\t"; break;
            default: escaped.push_back(c); break;
        }
    }
    return escaped;
}

string jsonString(const string& value) {
    return "\"" + jsonEscape(value) + "\"";
}

template <typename T>
string jsonArray(const vector<T>& items, const function<string(const T&)>& formatter) {
    ostringstream out;
    out << "[";
    for (size_t i = 0; i < items.size(); ++i) {
        if (i > 0) out << ",";
        out << formatter(items[i]);
    }
    out << "]";
    return out.str();
}

template <typename T>
string jsonObjectArray(const unordered_map<string, T>& data) {
    vector<string> keys;
    for (const auto& entry : data) keys.push_back(entry.first);
    sort(keys.begin(), keys.end());

    ostringstream out;
    out << "{";
    for (size_t i = 0; i < keys.size(); ++i) {
        if (i > 0) out << ",";
        out << jsonString(keys[i]) << ":" << data.at(keys[i]);
    }
    out << "}";
    return out.str();
}

struct Task {
    string id;
    string region;
    PollutionType pollutionType;
    RiskLevel riskLevel;
    int urgencyScore;
    int startTime;
    int endTime;

    int priority() const {
        int riskWeight = static_cast<int>(riskLevel) * 100;
        int durationBonus = endTime > startTime ? 300 / (endTime - startTime + 1) : 0;
        return riskWeight + urgencyScore + durationBonus;
    }

    int duration() const {
        return endTime - startTime;
    }
};

struct Satellite {
    string id;
    string name;
    int maxTasksPerOrbit;
    vector<string> coverableRegions;
    int assignedTasks = 0;

    bool hasCapacity() const {
        return assignedTasks < maxTasksPerOrbit;
    }
};

struct ScheduledTask {
    Task task;
    string satelliteId;
    string satelliteName;
    bool accepted;
    string rejectionReason;
    string selectionReason;
    string suggestedSolution;
};

struct SearchResult {
    bool found = false;
    ScheduledTask result;
};

struct BSTNode {
    Task task;
    string satelliteId;
    unique_ptr<BSTNode> left;
    unique_ptr<BSTNode> right;

    BSTNode(const Task& inputTask, const string& inputSatelliteId)
        : task(inputTask), satelliteId(inputSatelliteId) {}
};

class ScheduleBST {
private:
    unique_ptr<BSTNode> root;

    bool overlaps(int s1, int e1, int s2, int e2) const {
        return s1 < e2 && s2 < e1;
    }

    bool hasOverlapHelper(BSTNode* node, int start, int end) const {
        if (!node) return false;
        if (overlaps(node->task.startTime, node->task.endTime, start, end)) return true;
        if (start < node->task.startTime && hasOverlapHelper(node->left.get(), start, end)) return true;
        if (end > node->task.startTime && hasOverlapHelper(node->right.get(), start, end)) return true;
        return false;
    }

    void insertHelper(unique_ptr<BSTNode>& node, const Task& task, const string& satelliteId) {
        if (!node) {
            node = make_unique<BSTNode>(task, satelliteId);
            return;
        }
        if (task.startTime < node->task.startTime) insertHelper(node->left, task, satelliteId);
        else insertHelper(node->right, task, satelliteId);
    }

public:
    bool hasOverlap(int start, int end) const {
        return hasOverlapHelper(root.get(), start, end);
    }

    void insert(const Task& task, const string& satelliteId) {
        insertHelper(root, task, satelliteId);
    }

    void inorderHelper(BSTNode* node, vector<Task>& items) const {
        if (!node) return;
        inorderHelper(node->left.get(), items);
        items.push_back(node->task);
        inorderHelper(node->right.get(), items);
    }

    vector<Task> getSortedTasks() const {
        vector<Task> items;
        inorderHelper(root.get(), items);
        return items;
    }
};

class CoverageGraph {
private:
    unordered_map<string, vector<string>> satelliteToRegions;
    unordered_map<string, vector<string>> regionToSatellites;

public:
    void addEdge(const string& satelliteId, const string& region) {
        satelliteToRegions[satelliteId].push_back(region);
        regionToSatellites[region].push_back(satelliteId);
    }

    vector<string> getSatellitesForRegion(const string& region) const {
        auto it = regionToSatellites.find(region);
        if (it == regionToSatellites.end()) return {};
        return it->second;
    }

    const unordered_map<string, vector<string>>& getSatelliteToRegions() const {
        return satelliteToRegions;
    }

    const unordered_map<string, vector<string>>& getRegionToSatellites() const {
        return regionToSatellites;
    }
};

class AnalyticsManager {
public:
    int totalTasks = 0;
    int scheduledTasks = 0;
    int rejectedTasks = 0;
    int highRiskCovered = 0;
    unordered_map<string, int> satTaskCount;
    unordered_map<string, int> satMaxTasks;
    unordered_map<string, int> riskDist;
    unordered_map<string, int> rejectionReasons;

    void reset(int total) {
        totalTasks = total;
        scheduledTasks = 0;
        rejectedTasks = 0;
        highRiskCovered = 0;
        satTaskCount.clear();
        satMaxTasks.clear();
        riskDist.clear();
        rejectionReasons.clear();
    }

    void recordAccepted(const Task& task, const string& satelliteId, int maxTasks) {
        scheduledTasks++;
        satTaskCount[satelliteId]++;
        satMaxTasks[satelliteId] = maxTasks;
        riskDist[riskToStr(task.riskLevel)]++;
        if (task.riskLevel == RiskLevel::HIGH) highRiskCovered++;
    }

    void recordRejected(const Task& task, const string& reason) {
        rejectedTasks++;
        rejectionReasons[reason]++;
        riskDist[riskToStr(task.riskLevel)]++;
    }

    double efficiency() const {
        if (totalTasks == 0) return 0.0;
        return (100.0 * scheduledTasks) / totalTasks;
    }
};

class Scheduler {
private:
    unordered_map<string, Satellite> satellites;
    vector<Task> tasks;
    unordered_map<string, ScheduleBST> satelliteSchedules;
    CoverageGraph coverageGraph;
    AnalyticsManager analytics;
    vector<ScheduledTask> results;
    vector<Task> priorityOrder;

    struct TaskComparator {
        bool operator()(const Task& a, const Task& b) const {
            if (a.priority() != b.priority()) return a.priority() < b.priority();
            if (a.endTime != b.endTime) return a.endTime > b.endTime;
            return a.startTime > b.startTime;
        }
    };

    static bool taskSortComparator(const Task& a, const Task& b) {
        TaskComparator comparator;
        return comparator(b, a);
    }

    vector<string> sortedSatelliteIds() const {
        vector<string> ids;
        for (const auto& entry : satellites) ids.push_back(entry.first);
        sort(ids.begin(), ids.end());
        return ids;
    }

    vector<ScheduledTask> acceptedResults() const {
        vector<ScheduledTask> accepted;
        for (const auto& item : results) {
            if (item.accepted) accepted.push_back(item);
        }
        sort(accepted.begin(), accepted.end(), [](const ScheduledTask& a, const ScheduledTask& b) {
            if (a.satelliteId != b.satelliteId) return a.satelliteId < b.satelliteId;
            if (a.task.startTime != b.task.startTime) return a.task.startTime < b.task.startTime;
            return a.task.id < b.task.id;
        });
        return accepted;
    }

    vector<ScheduledTask> rejectedResults() const {
        vector<ScheduledTask> rejected;
        for (const auto& item : results) {
            if (!item.accepted) rejected.push_back(item);
        }
        sort(rejected.begin(), rejected.end(), [](const ScheduledTask& a, const ScheduledTask& b) {
            if (a.task.priority() != b.task.priority()) return a.task.priority() > b.task.priority();
            return a.task.id < b.task.id;
        });
        return rejected;
    }

    string taskJson(const Task& task) const {
        ostringstream out;
        out << "{"
            << "\"id\":" << jsonString(task.id) << ","
            << "\"region\":" << jsonString(task.region) << ","
            << "\"pollutionType\":" << jsonString(pollutionToStr(task.pollutionType)) << ","
            << "\"riskLevel\":" << jsonString(riskToStr(task.riskLevel)) << ","
            << "\"urgencyScore\":" << task.urgencyScore << ","
            << "\"startTime\":" << task.startTime << ","
            << "\"endTime\":" << task.endTime << ","
            << "\"duration\":" << task.duration() << ","
            << "\"priority\":" << task.priority()
            << "}";
        return out.str();
    }

    string scheduledTaskJson(const ScheduledTask& item) const {
        ostringstream out;
        out << "{"
            << "\"id\":" << jsonString(item.task.id) << ","
            << "\"region\":" << jsonString(item.task.region) << ","
            << "\"pollutionType\":" << jsonString(pollutionToStr(item.task.pollutionType)) << ","
            << "\"riskLevel\":" << jsonString(riskToStr(item.task.riskLevel)) << ","
            << "\"urgencyScore\":" << item.task.urgencyScore << ","
            << "\"startTime\":" << item.task.startTime << ","
            << "\"endTime\":" << item.task.endTime << ","
            << "\"duration\":" << item.task.duration() << ","
            << "\"priority\":" << item.task.priority() << ","
            << "\"accepted\":" << (item.accepted ? "true" : "false") << ","
            << "\"satelliteId\":" << jsonString(item.satelliteId) << ","
            << "\"satelliteName\":" << jsonString(item.satelliteName) << ","
            << "\"selectionReason\":" << jsonString(item.selectionReason) << ","
            << "\"rejectionReason\":" << jsonString(item.rejectionReason) << ","
            << "\"suggestedSolution\":" << jsonString(item.suggestedSolution)
            << "}";
        return out.str();
    }

    string searchResultJson(const SearchResult& searchResult) const {
        ostringstream out;
        out << "{"
            << "\"found\":" << (searchResult.found ? "true" : "false") << ","
            << "\"result\":";
        if (searchResult.found) out << scheduledTaskJson(searchResult.result);
        else out << "null";
        out << "}";
        return out.str();
    }

    string scheduledTaskCollectionJson(const vector<ScheduledTask>& items) const {
        return jsonArray<ScheduledTask>(items, [this](const ScheduledTask& item) {
            return scheduledTaskJson(item);
        });
    }

public:
    void reset() {
        satellites.clear();
        tasks.clear();
        satelliteSchedules.clear();
        coverageGraph = CoverageGraph();
        results.clear();
        priorityOrder.clear();
        analytics.reset(0);
    }

    void addSatellite(const Satellite& satellite) {
        satellites[satellite.id] = satellite;
        for (const string& region : satellite.coverableRegions) {
            coverageGraph.addEdge(satellite.id, region);
        }
    }

    void addTask(const Task& task) {
        tasks.push_back(task);
    }

    void loadDemoData() {
        reset();
        addSatellite({"SAT-001", "Sentinel Alpha", 4, {"Pacific Ocean", "Arctic Sea", "Bering Sea"}, 0});
        addSatellite({"SAT-002", "OceanEye Beta", 3, {"Indian Ocean", "Arabian Sea", "Red Sea"}, 0});
        addSatellite({"SAT-003", "CoastalWatch Gamma", 5, {"Atlantic Ocean", "North Sea", "Pacific Ocean"}, 0});
        addSatellite({"SAT-004", "PolarSpy Delta", 3, {"Arctic Sea", "Antarctic Ocean", "Bering Sea"}, 0});

        addTask({"TSK-001", "Pacific Ocean", PollutionType::OIL_SPILL, RiskLevel::HIGH, 95, 60, 120});
        addTask({"TSK-002", "Indian Ocean", PollutionType::PLASTIC, RiskLevel::HIGH, 88, 100, 160});
        addTask({"TSK-003", "Arctic Sea", PollutionType::CHEMICAL, RiskLevel::HIGH, 92, 200, 260});
        addTask({"TSK-004", "Atlantic Ocean", PollutionType::INDUSTRIAL, RiskLevel::MEDIUM, 75, 60, 130});
        addTask({"TSK-005", "North Sea", PollutionType::PLASTIC, RiskLevel::MEDIUM, 65, 300, 360});
        addTask({"TSK-006", "Arabian Sea", PollutionType::OIL_SPILL, RiskLevel::HIGH, 90, 100, 180});
        addTask({"TSK-007", "Pacific Ocean", PollutionType::CHEMICAL, RiskLevel::MEDIUM, 70, 80, 140});
        addTask({"TSK-008", "Caspian Sea", PollutionType::INDUSTRIAL, RiskLevel::LOW, 40, 400, 450});
        addTask({"TSK-009", "Bering Sea", PollutionType::PLASTIC, RiskLevel::MEDIUM, 60, 500, 550});
        addTask({"TSK-010", "Arctic Sea", PollutionType::OIL_SPILL, RiskLevel::HIGH, 97, 200, 250});
        addTask({"TSK-011", "Red Sea", PollutionType::CHEMICAL, RiskLevel::LOW, 45, 600, 650});
        addTask({"TSK-012", "Antarctic Ocean", PollutionType::PLASTIC, RiskLevel::MEDIUM, 55, 700, 760});
    }

    void run() {
        satelliteSchedules.clear();
        results.clear();
        priorityOrder = tasks;
        sort(priorityOrder.begin(), priorityOrder.end(), taskSortComparator);

        for (auto& entry : satellites) {
            entry.second.assignedTasks = 0;
        }
        analytics.reset(static_cast<int>(tasks.size()));

        priority_queue<Task, vector<Task>, TaskComparator> taskHeap;
        for (const Task& task : tasks) {
            taskHeap.push(task);
        }

        while (!taskHeap.empty()) {
            Task task = taskHeap.top();
            taskHeap.pop();

            vector<string> coveringSatellites = coverageGraph.getSatellitesForRegion(task.region);
            sort(coveringSatellites.begin(), coveringSatellites.end());

            if (coveringSatellites.empty()) {
                results.push_back({
                    task,
                    "",
                    "",
                    false,
                    "No satellite coverage for region",
                    "",
                    "Add a satellite that can cover this region, or change the task region to one already covered."
                });
                analytics.recordRejected(task, "No Satellite Coverage");
                continue;
            }

            string selectedSatelliteId;
            int minLoad = numeric_limits<int>::max();
            vector<string> eligibleSatellites;

            for (const string& satelliteId : coveringSatellites) {
                Satellite& satellite = satellites[satelliteId];
                if (!satellite.hasCapacity()) continue;
                if (satelliteSchedules[satelliteId].hasOverlap(task.startTime, task.endTime)) continue;
                eligibleSatellites.push_back(satelliteId);
                if (satellite.assignedTasks < minLoad) {
                    minLoad = satellite.assignedTasks;
                    selectedSatelliteId = satelliteId;
                }
            }

            if (!selectedSatelliteId.empty()) {
                satelliteSchedules[selectedSatelliteId].insert(task, selectedSatelliteId);
                Satellite& satellite = satellites[selectedSatelliteId];
                satellite.assignedTasks++;

                ostringstream reason;
                reason << "Selected from coverage graph candidates "
                       << eligibleSatellites.size()
                       << " with least current load "
                       << (satellite.assignedTasks - 1)
                       << "/" << satellite.maxTasksPerOrbit
                       << " and no BST overlap in ["
                       << task.startTime << ", " << task.endTime << ").";

                results.push_back({task, selectedSatelliteId, satellite.name, true, "", reason.str()});
                analytics.recordAccepted(task, selectedSatelliteId, satellite.maxTasksPerOrbit);
                continue;
            }

            bool anyCapacity = false;
            for (const string& satelliteId : coveringSatellites) {
                if (satellites[satelliteId].hasCapacity()) {
                    anyCapacity = true;
                    break;
                }
            }

            if (!anyCapacity) {
                results.push_back({
                    task,
                    "",
                    "",
                    false,
                    "All covering satellites at capacity",
                    "",
                    "Increase satellite capacity, free an occupied slot, or add another satellite for this region."
                });
                analytics.recordRejected(task, "Satellite Capacity Exceeded");
            } else {
                results.push_back({
                    task,
                    "",
                    "",
                    false,
                    "Overlapping observation window on all eligible satellites",
                    "",
                    "Change the task time window, or add another satellite that covers the same region."
                });
                analytics.recordRejected(task, "Overlapping Observation Window");
            }
        }
    }

    SearchResult findTaskById(const string& taskId) const {
        for (const auto& item : results) {
            if (item.task.id == taskId) {
                return {true, item};
            }
        }
        return {};
    }

    vector<ScheduledTask> findTasksInInterval(int startTime, int endTime) const {
        vector<ScheduledTask> matches;
        for (const auto& item : results) {
            if (item.accepted && !(item.task.endTime <= startTime || item.task.startTime >= endTime)) {
                matches.push_back(item);
            }
        }
        sort(matches.begin(), matches.end(), [](const ScheduledTask& a, const ScheduledTask& b) {
            if (a.task.startTime != b.task.startTime) return a.task.startTime < b.task.startTime;
            return a.task.id < b.task.id;
        });
        return matches;
    }

    vector<ScheduledTask> findTasksByRegion(const string& region) const {
        vector<ScheduledTask> matches;
        for (const auto& item : results) {
            if (toLowerStr(item.task.region) == toLowerStr(region)) {
                matches.push_back(item);
            }
        }
        sort(matches.begin(), matches.end(), [](const ScheduledTask& a, const ScheduledTask& b) {
            if (a.task.priority() != b.task.priority()) return a.task.priority() > b.task.priority();
            return a.task.id < b.task.id;
        });
        return matches;
    }

    vector<ScheduledTask> findTasksByRisk(const string& risk) const {
        vector<ScheduledTask> matches;
        for (const auto& item : results) {
            if (toLowerStr(riskToStr(item.task.riskLevel)) == toLowerStr(risk)) {
                matches.push_back(item);
            }
        }
        sort(matches.begin(), matches.end(), [](const ScheduledTask& a, const ScheduledTask& b) {
            if (a.task.priority() != b.task.priority()) return a.task.priority() > b.task.priority();
            return a.task.id < b.task.id;
        });
        return matches;
    }

    string sortedSchedulesJson() const {
        vector<string> satelliteIds = sortedSatelliteIds();
        ostringstream out;
        out << "[";
        bool first = true;
        for (const string& satelliteId : satelliteIds) {
            auto scheduleIt = satelliteSchedules.find(satelliteId);
            if (scheduleIt == satelliteSchedules.end()) continue;
            vector<Task> sortedTasks = scheduleIt->second.getSortedTasks();
            if (!first) out << ",";
            first = false;
            const Satellite& satellite = satellites.at(satelliteId);
            out << "{"
                << "\"satelliteId\":" << jsonString(satellite.id) << ","
                << "\"satelliteName\":" << jsonString(satellite.name) << ","
                << "\"tasks\":" << jsonArray<Task>(sortedTasks, [this, &satellite](const Task& task) {
                    ScheduledTask item{task, satellite.id, satellite.name, true, "", "", ""};
                    return scheduledTaskJson(item);
                })
                << "}";
        }
        out << "]";
        return out.str();
    }

    string uncoveredRegionsJson() const {
        unordered_map<string, int> uncoveredCounts;
        for (const Task& task : tasks) {
            if (coverageGraph.getSatellitesForRegion(task.region).empty()) {
                uncoveredCounts[task.region]++;
            }
        }
        vector<string> regions;
        for (const auto& entry : uncoveredCounts) regions.push_back(entry.first);
        sort(regions.begin(), regions.end());
        ostringstream out;
        out << "[";
        for (size_t i = 0; i < regions.size(); ++i) {
            if (i > 0) out << ",";
            out << "{"
                << "\"region\":" << jsonString(regions[i]) << ","
                << "\"taskCount\":" << uncoveredCounts[regions[i]]
                << "}";
        }
        out << "]";
        return out.str();
    }

    string regionCoverageReportJson() const {
        unordered_map<string, int> regionTaskCounts;
        for (const Task& task : tasks) regionTaskCounts[task.region]++;
        vector<string> regionNames;
        for (const auto& entry : regionTaskCounts) regionNames.push_back(entry.first);
        sort(regionNames.begin(), regionNames.end());

        ostringstream out;
        out << "[";
        for (size_t i = 0; i < regionNames.size(); ++i) {
            if (i > 0) out << ",";
            vector<string> coveringSatellites = coverageGraph.getSatellitesForRegion(regionNames[i]);
            sort(coveringSatellites.begin(), coveringSatellites.end());
            out << "{"
                << "\"region\":" << jsonString(regionNames[i]) << ","
                << "\"taskCount\":" << regionTaskCounts[regionNames[i]] << ","
                << "\"covered\":" << (!coveringSatellites.empty() ? "true" : "false") << ","
                << "\"coveringSatellites\":" << jsonArray<string>(coveringSatellites, [](const string& satelliteId) {
                    return jsonString(satelliteId);
                })
                << "}";
        }
        out << "]";
        return out.str();
    }

    string topPendingTasksJson(int limit = 5) const {
        vector<ScheduledTask> rejected = rejectedResults();
        if (static_cast<int>(rejected.size()) > limit) rejected.resize(limit);
        return scheduledTaskCollectionJson(rejected);
    }

    string satelliteRankingJson() const {
        vector<Satellite> ranked;
        for (const auto& entry : satellites) ranked.push_back(entry.second);
        sort(ranked.begin(), ranked.end(), [](const Satellite& a, const Satellite& b) {
            if (a.assignedTasks != b.assignedTasks) return a.assignedTasks > b.assignedTasks;
            return a.id < b.id;
        });
        return jsonArray<Satellite>(ranked, [](const Satellite& satellite) {
            ostringstream out;
            int utilization = satellite.maxTasksPerOrbit == 0 ? 0 : (100 * satellite.assignedTasks) / satellite.maxTasksPerOrbit;
            out << "{"
                << "\"satelliteId\":" << jsonString(satellite.id) << ","
                << "\"name\":" << jsonString(satellite.name) << ","
                << "\"assigned\":" << satellite.assignedTasks << ","
                << "\"maxTasks\":" << satellite.maxTasksPerOrbit << ","
                << "\"utilization\":" << utilization
                << "}";
            return out.str();
        });
    }

    string waitingListJson() const {
        return scheduledTaskCollectionJson(rejectedResults());
    }

    string toJson() const {
        vector<ScheduledTask> accepted = acceptedResults();
        vector<ScheduledTask> rejected = rejectedResults();
        vector<string> satelliteIds = sortedSatelliteIds();

        ostringstream out;
        out << "{";

        out << "\"accepted\":" << jsonArray<ScheduledTask>(accepted, [this](const ScheduledTask& item) {
            return scheduledTaskJson(item);
        }) << ",";

        out << "\"rejected\":" << jsonArray<ScheduledTask>(rejected, [this](const ScheduledTask& item) {
            return scheduledTaskJson(item);
        }) << ",";

        out << "\"analytics\":{"
            << "\"totalTasks\":" << analytics.totalTasks << ","
            << "\"scheduledTasks\":" << analytics.scheduledTasks << ","
            << "\"rejectedTasks\":" << analytics.rejectedTasks << ","
            << "\"highRiskCovered\":" << analytics.highRiskCovered << ","
            << "\"schedulingEfficiency\":" << fixed << setprecision(2) << analytics.efficiency() << ","
            << "\"riskDistribution\":" << jsonObjectArray<int>(analytics.riskDist) << ","
            << "\"rejectionReasons\":" << jsonObjectArray<int>(analytics.rejectionReasons)
            << "},";

        out << "\"priorityQueueView\":" << jsonArray<Task>(priorityOrder, [this, rank = 0](const Task& task) mutable {
            ostringstream item;
            ++rank;
            item << "{"
                 << "\"rank\":" << rank << ","
                 << "\"id\":" << jsonString(task.id) << ","
                 << "\"region\":" << jsonString(task.region) << ","
                 << "\"riskLevel\":" << jsonString(riskToStr(task.riskLevel)) << ","
                 << "\"urgencyScore\":" << task.urgencyScore << ","
                 << "\"startTime\":" << task.startTime << ","
                 << "\"endTime\":" << task.endTime << ","
                 << "\"priority\":" << task.priority()
                 << "}";
            return item.str();
        }) << ",";

        out << "\"coverageGraph\":{";
        out << "\"satelliteToRegions\":";
        out << "[";
        for (size_t i = 0; i < satelliteIds.size(); ++i) {
            if (i > 0) out << ",";
            const Satellite& satellite = satellites.at(satelliteIds[i]);
            vector<string> regions = satellite.coverableRegions;
            sort(regions.begin(), regions.end());
            out << "{"
                << "\"satelliteId\":" << jsonString(satellite.id) << ","
                << "\"satelliteName\":" << jsonString(satellite.name) << ","
                << "\"regions\":" << jsonArray<string>(regions, [](const string& region) {
                    return jsonString(region);
                })
                << "}";
        }
        out << "],";

        vector<string> regions;
        for (const auto& entry : coverageGraph.getRegionToSatellites()) regions.push_back(entry.first);
        sort(regions.begin(), regions.end());
        out << "\"regionToSatellites\":[";
        for (size_t i = 0; i < regions.size(); ++i) {
            if (i > 0) out << ",";
            vector<string> regionSatellites = coverageGraph.getSatellitesForRegion(regions[i]);
            sort(regionSatellites.begin(), regionSatellites.end());
            out << "{"
                << "\"region\":" << jsonString(regions[i]) << ","
                << "\"satellites\":" << jsonArray<string>(regionSatellites, [](const string& satelliteId) {
                    return jsonString(satelliteId);
                })
                << "}";
        }
        out << "]";
        out << "},";

        out << "\"timeline\":" << jsonArray<ScheduledTask>(accepted, [this](const ScheduledTask& item) {
            ostringstream timelineItem;
            timelineItem << "{"
                         << "\"taskId\":" << jsonString(item.task.id) << ","
                         << "\"satelliteId\":" << jsonString(item.satelliteId) << ","
                         << "\"satelliteName\":" << jsonString(item.satelliteName) << ","
                         << "\"region\":" << jsonString(item.task.region) << ","
                         << "\"startTime\":" << item.task.startTime << ","
                         << "\"endTime\":" << item.task.endTime
                         << "}";
            return timelineItem.str();
        }) << ",";

        out << "\"satelliteUtilization\":[";
        for (size_t i = 0; i < satelliteIds.size(); ++i) {
            if (i > 0) out << ",";
            const Satellite& satellite = satellites.at(satelliteIds[i]);
            int utilization = satellite.maxTasksPerOrbit == 0 ? 0 : (100 * satellite.assignedTasks) / satellite.maxTasksPerOrbit;
            out << "{"
                << "\"satelliteId\":" << jsonString(satellite.id) << ","
                << "\"name\":" << jsonString(satellite.name) << ","
                << "\"assigned\":" << satellite.assignedTasks << ","
                << "\"maxTasks\":" << satellite.maxTasksPerOrbit << ","
                << "\"utilization\":" << utilization
                << "}";
        }
        out << "],";

        out << "\"taskResultIndex\":" << jsonArray<ScheduledTask>(results, [this](const ScheduledTask& item) {
            return scheduledTaskJson(item);
        }) << ",";

        out << "\"sortedSchedules\":" << sortedSchedulesJson() << ",";
        out << "\"regionCoverageReport\":" << regionCoverageReportJson() << ",";
        out << "\"uncoveredRegions\":" << uncoveredRegionsJson() << ",";
        out << "\"topPendingTasks\":" << topPendingTasksJson() << ",";
        out << "\"satelliteRanking\":" << satelliteRankingJson() << ",";
        out << "\"waitingList\":" << waitingListJson() << ",";

        out << "\"complexity\":{"
            << "\"priorityQueue\":" << jsonString("Task insertion and extraction use O(log n).") << ","
            << "\"coverageGraph\":" << jsonString("Graph build is O(V + E) and region lookup is O(degree).") << ","
            << "\"bstOverlap\":" << jsonString("BST overlap checks are O(log n) average per satellite schedule.") << ","
            << "\"overall\":" << jsonString("Full scheduling run is approximately O(n log n).")
            << "}";

        out << "}";
        return out.str();
    }

    string taskSearchJson(const string& taskId) const {
        SearchResult searchResult = findTaskById(taskId);
        ostringstream out;
        out << "{"
            << "\"queryType\":\"taskId\","
            << "\"taskId\":" << jsonString(taskId) << ","
            << "\"search\":" << searchResultJson(searchResult)
            << "}";
        return out.str();
    }

    string intervalSearchJson(int startTime, int endTime) const {
        vector<ScheduledTask> matches = findTasksInInterval(startTime, endTime);
        ostringstream out;
        out << "{"
            << "\"queryType\":\"interval\","
            << "\"startTime\":" << startTime << ","
            << "\"endTime\":" << endTime << ","
            << "\"matches\":" << jsonArray<ScheduledTask>(matches, [this](const ScheduledTask& item) {
                return scheduledTaskJson(item);
            })
            << "}";
        return out.str();
    }

    string regionSearchJson(const string& region) const {
        vector<ScheduledTask> matches = findTasksByRegion(region);
        ostringstream out;
        out << "{"
            << "\"queryType\":\"region\","
            << "\"region\":" << jsonString(region) << ","
            << "\"matches\":" << scheduledTaskCollectionJson(matches)
            << "}";
        return out.str();
    }

    string riskSearchJson(const string& risk) const {
        vector<ScheduledTask> matches = findTasksByRisk(risk);
        ostringstream out;
        out << "{"
            << "\"queryType\":\"risk\","
            << "\"riskLevel\":" << jsonString(risk) << ","
            << "\"matches\":" << scheduledTaskCollectionJson(matches)
            << "}";
        return out.str();
    }

    void printSummary() const {
        cout << "\nScheduling complete.\n";
        cout << "Accepted Tasks: " << analytics.scheduledTasks << "\n";
        cout << "Rejected Tasks: " << analytics.rejectedTasks << "\n";
        cout << "Efficiency: " << fixed << setprecision(2) << analytics.efficiency() << "%\n";
    }
};

bool loadApiInput(Scheduler& scheduler) {
    string header;
    if (!getline(cin, header)) return false;
    header = trim(header);
    if (header.rfind("SATELLITES ", 0) != 0) return false;

    int satelliteCount = stoi(header.substr(11));
    for (int i = 0; i < satelliteCount; ++i) {
        string line;
        getline(cin, line);
        vector<string> parts = splitEscaped(line, '|');
        if (parts.size() < 4) return false;

        Satellite satellite;
        satellite.id = parts[0];
        satellite.name = parts[1];
        satellite.maxTasksPerOrbit = stoi(parts[2]);
        if (!parts[3].empty()) satellite.coverableRegions = splitEscaped(parts[3], ',');
        scheduler.addSatellite(satellite);
    }

    string taskHeader;
    if (!getline(cin, taskHeader)) return false;
    taskHeader = trim(taskHeader);
    if (taskHeader.rfind("TASKS ", 0) != 0) return false;

    int taskCount = stoi(taskHeader.substr(6));
    for (int i = 0; i < taskCount; ++i) {
        string line;
        getline(cin, line);
        vector<string> parts = splitEscaped(line, '|');
        if (parts.size() < 7) return false;

        Task task;
        task.id = parts[0];
        task.region = parts[1];
        task.pollutionType = parsePollutionType(parts[2]);
        task.riskLevel = parseRiskLevel(parts[3]);
        task.urgencyScore = stoi(parts[4]);
        task.startTime = stoi(parts[5]);
        task.endTime = stoi(parts[6]);
        scheduler.addTask(task);
    }

    return true;
}

string readLineValue() {
    string value;
    cin >> ws;
    getline(cin, value);
    return value;
}

void addSatelliteInteractive(Scheduler& scheduler) {
    Satellite satellite;
    cout << "\nEnter Satellite ID: ";
    cin >> satellite.id;
    cout << "Enter Satellite Name: ";
    satellite.name = readLineValue();
    cout << "Enter Max Tasks Per Orbit/Day: ";
    cin >> satellite.maxTasksPerOrbit;
    cout << "Enter number of coverable regions: ";
    int regionCount;
    cin >> regionCount;
    cin.ignore(numeric_limits<streamsize>::max(), '\n');
    for (int i = 0; i < regionCount; ++i) {
        string region;
        cout << "Enter region " << (i + 1) << ": ";
        getline(cin, region);
        satellite.coverableRegions.push_back(region);
    }
    scheduler.addSatellite(satellite);
    cout << "Satellite added successfully.\n";
}

void addTaskInteractive(Scheduler& scheduler) {
    Task task;
    cout << "\nEnter Task ID: ";
    cin >> task.id;
    cout << "Enter Ocean Region: ";
    task.region = readLineValue();

    int pollutionChoice;
    cout << "Select Pollution Type:\n";
    cout << "1. Plastic\n2. Oil Spill\n3. Industrial\n4. Chemical\nEnter choice: ";
    cin >> pollutionChoice;
    task.pollutionType = pollutionChoice == 2 ? PollutionType::OIL_SPILL :
                         pollutionChoice == 3 ? PollutionType::INDUSTRIAL :
                         pollutionChoice == 4 ? PollutionType::CHEMICAL :
                                                PollutionType::PLASTIC;

    int riskChoice;
    cout << "Select Risk Level:\n";
    cout << "1. Low\n2. Medium\n3. High\nEnter choice: ";
    cin >> riskChoice;
    task.riskLevel = riskChoice == 3 ? RiskLevel::HIGH :
                     riskChoice == 2 ? RiskLevel::MEDIUM :
                                       RiskLevel::LOW;

    cout << "Enter Urgency Score (1-100): ";
    cin >> task.urgencyScore;
    cout << "Enter Start Time: ";
    cin >> task.startTime;
    cout << "Enter End Time: ";
    cin >> task.endTime;

    if (task.endTime <= task.startTime) {
        cout << "Invalid task: end time must be greater than start time.\n";
        return;
    }

    scheduler.addTask(task);
    cout << "Task added successfully.\n";
}

int main(int argc, char* argv[]) {
    Scheduler scheduler;

    if (argc > 1 && string(argv[1]) == "--api") {
        if (!loadApiInput(scheduler)) {
            cerr << "Invalid API input\n";
            return 1;
        }

        scheduler.run();

        if (argc > 3 && string(argv[2]) == "--search-task") {
            cout << scheduler.taskSearchJson(argv[3]);
            return 0;
        }

        if (argc > 4 && string(argv[2]) == "--search-interval") {
            int startTime = stoi(argv[3]);
            int endTime = stoi(argv[4]);
            cout << scheduler.intervalSearchJson(startTime, endTime);
            return 0;
        }

        if (argc > 3 && string(argv[2]) == "--search-region") {
            cout << scheduler.regionSearchJson(argv[3]);
            return 0;
        }

        if (argc > 3 && string(argv[2]) == "--search-risk") {
            cout << scheduler.riskSearchJson(argv[3]);
            return 0;
        }

        cout << scheduler.toJson();
        return 0;
    }

    int choice = 0;
    do {
        cout << "\n====================================================\n";
        cout << " SATELLITE-BASED OCEAN POLLUTION MONITORING SYSTEM\n";
        cout << "====================================================\n";
        cout << "1. Add Satellite\n";
        cout << "2. Add Monitoring Task\n";
        cout << "3. Load Demo Data\n";
        cout << "4. Generate Optimal Schedule\n";
        cout << "5. Exit\n";
        cout << "Enter your choice: ";
        cin >> choice;

        switch (choice) {
            case 1:
                addSatelliteInteractive(scheduler);
                break;
            case 2:
                addTaskInteractive(scheduler);
                break;
            case 3:
                scheduler.loadDemoData();
                cout << "Demo data loaded successfully.\n";
                break;
            case 4:
                scheduler.run();
                scheduler.printSummary();
                break;
            case 5:
                cout << "Exiting program.\n";
                break;
            default:
                cout << "Invalid choice. Please try again.\n";
                break;
        }
    } while (choice != 5);

    return 0;
}
