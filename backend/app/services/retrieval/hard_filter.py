from typing import List, Dict, Any, Tuple
from backend.app.schemas.problem_profile import ProblemProfile


class HardConstraintFilter:
    """
    Enforces non-negotiable hard constraints before ranking (Section 14 & Section 65).
    Zero tolerance for compute, modality, or temporal hard constraint violations.
    """

    @staticmethod
    def _candidate_text(candidate: Dict[str, Any]) -> str:
        values = [
            candidate.get("name"), candidate.get("title"), candidate.get("description"),
            candidate.get("abstract"), candidate.get("domain"), candidate.get("task"),
            candidate.get("modality"), candidate.get("modalities"), candidate.get("domains"),
            candidate.get("subdomains"), candidate.get("paper_type"),
        ]
        return " ".join(str(value) for value in values if value).lower()

    @staticmethod
    def _domain_conflict(text: str, profile: ProblemProfile) -> str | None:
        import re
        query = profile.original_problem.lower()
        requested = " ".join(profile.domains + profile.subdomains).lower()

        if re.search(r"\b(?:crop|plant|leaf|leaves|agriculture|farming|plant pathology)\b", query):
            if not re.search(r"\b(?:plant|crop|leaf|leaves|agricultur|botan|phytopath)\b", text) and re.search(
                r"\b(?:skin lesion|melanoma|face recognition|facial|chest x.?ray|cxr|ultrasound|mri|brain|retina|fundus|patient|clinical|medical|biomedical|isic)\b",
                text,
            ):
                return "candidate is medical or human-vision data, not plant/agriculture data"
        elif re.search(r"\b(?:medical|clinical|patient|biomedical|mri|ct scan|ultrasound|radiology)\b", requested + " " + query):
            if re.search(r"\b(?:plant|crop|leaf|agricultur|phytopath)\b", text) and not re.search(
                r"\b(?:patient|clinical|medical|biomedical|radiolog|mri|ct)\b", text
            ):
                return "candidate is agriculture data for a medical query"
        elif re.search(r"\b(?:speech|audio|acoustic|voice)\b", query):
            if re.search(r"\b(?:image|photo|leaf|skin|x.?ray|mri|ct)\b", text) and not re.search(r"\b(?:audio|speech|voice|wav)\b", text):
                return "candidate is image data for an audio query"
        elif re.search(r"\b(?:cybersecurity|cyber security|network traffic|http request|intrusion)\b", query):
            if re.search(r"\b(?:medical|clinical|patient|plant|crop|leaf|mri|x.?ray|ultrasound)\b", text):
                return "candidate is outside the cybersecurity domain"

        if re.search(r"\b(?:classif|classify|classification)\b", query):
            if re.search(r"\b(?:segmentation|reconstruction|forecasting|generation)\b", text) and not re.search(
                r"\b(?:classif|classify|classification)\b", text
            ):
                return "candidate task is not image classification"
        elif re.search(r"\b(?:segment|segmentation)\b", query):
            if re.search(r"\b(?:classification|classify|forecasting|generation)\b", text) and not re.search(
                r"\b(?:segment|segmentation)\b", text
            ):
                return "candidate task is not segmentation"

        return None

    def _reject_domain_conflict(
        self,
        candidates: List[Tuple[Dict[str, Any], float]],
        profile: ProblemProfile,
    ) -> Tuple[List[Tuple[Dict[str, Any], float]], List[Dict[str, Any]]]:
        passed: List[Tuple[Dict[str, Any], float]] = []
        rejected: List[Dict[str, Any]] = []
        for cand, score in candidates:
            reason = self._domain_conflict(self._candidate_text(cand), profile)
            if reason:
                cand["rejection_reason"] = f"Domain conflict: {reason}"
                rejected.append(cand)
            else:
                passed.append((cand, score))
        return passed, rejected

    def filter_datasets(
        self,
        candidates: List[Tuple[Dict[str, Any], float]],
        profile: ProblemProfile,
    ) -> Tuple[List[Tuple[Dict[str, Any], float]], List[Dict[str, Any]]]:
        passed, rejected = self._reject_domain_conflict(candidates, profile)
        candidates = passed
        passed = []

        req_modalities = [m.lower() for m in profile.modalities]

        for cand, score in candidates:
            c_mods = [m.lower() for m in cand.get("modalities", [])]

            # Hard domain mismatch check
            if profile.domains:
                c_domain = cand.get("domain", "")
                if c_domain and not any(rd.lower() in c_domain.lower() or c_domain.lower() in rd.lower() for rd in profile.domains):
                    cand["rejection_reason"] = f"Domain conflict: requested {profile.domains}, dataset domain is '{c_domain}'"
                    rejected.append(cand)
                    continue

            # Hard modality mismatch check
            if req_modalities and c_mods:
                if not any(rm in c_mods or any(cm in rm for cm in c_mods) for rm in req_modalities):
                    # Check if candidate mentions requested modality in text
                    desc = f"{cand.get('title', '')} {cand.get('name', '')} {cand.get('description', '')}".lower()
                    if not any(rm in desc for rm in req_modalities):
                        cand["rejection_reason"] = f"Modality conflict: requires {req_modalities}, dataset is {c_mods}"
                        rejected.append(cand)
                        continue

            passed.append((cand, score))

        return passed, rejected

    def filter_models(
        self,
        candidates: List[Tuple[Dict[str, Any], float]],
        profile: ProblemProfile,
    ) -> Tuple[List[Tuple[Dict[str, Any], float]], List[Dict[str, Any]]]:
        passed, rejected = self._reject_domain_conflict(candidates, profile)
        candidates = passed
        passed = []

        max_gpu_vram = profile.compute_constraints.gpu_memory_gb
        max_latency_ms = profile.compute_constraints.latency_ms
        req_modalities = [m.lower() for m in profile.modalities]
        req_tasks = [(t.name if hasattr(t, "name") else str(t)).lower() for t in profile.tasks]

        for cand, score in candidates:
            # Hard Modality Check
            c_mods = [m.lower() for m in cand.get("modalities", [])]
            if req_modalities and c_mods:
                if not any(rm in c_mods or any(cm in rm for cm in c_mods) for rm in req_modalities):
                    cand["rejection_reason"] = f"Modality conflict: requires {req_modalities}, model supports {c_mods}"
                    rejected.append(cand)
                    continue

            # Hard Task Check
            c_tasks = [t.lower() for t in cand.get("tasks", [])]
            if req_tasks and c_tasks:
                if not any(rt in c_tasks or any(ct in rt for ct in c_tasks) for rt in req_tasks):
                    # check semantic equivalents
                    desc = f"{cand.get('description', '')} {cand.get('name', '')}".lower()
                    if not any(rt in desc for rt in req_tasks):
                        cand["rejection_reason"] = f"Task conflict: requires {req_tasks}, model supports {c_tasks}"
                        rejected.append(cand)
                        continue

            # 1. Hard Compute Check: GPU VRAM Limit
            mem_info = cand.get("memory_requirement") or {}
            min_vram = cand.get("min_vram_gb") or mem_info.get("min_vram_gb")

            if max_gpu_vram is not None and min_vram is not None:
                if float(min_vram) > float(max_gpu_vram):
                    cand["rejection_reason"] = (
                        f"Compute violation: requires {min_vram}GB GPU, exceeding hard limit of {max_gpu_vram}GB"
                    )
                    rejected.append(cand)
                    continue

            # 2. Hard Latency Check
            inf_info = cand.get("inference_information") or {}
            cand_latency = cand.get("latency_ms") or inf_info.get("latency_ms")
            if max_latency_ms is not None and cand_latency is not None:
                if float(cand_latency) > float(max_latency_ms):
                    cand["rejection_reason"] = (
                        f"Latency violation: {cand_latency}ms exceeds hard limit of {max_latency_ms}ms"
                    )
                    rejected.append(cand)
                    continue

            passed.append((cand, score))

        return passed, rejected

    def filter_papers(
        self,
        candidates: List[Tuple[Dict[str, Any], float]],
        profile: ProblemProfile,
    ) -> Tuple[List[Tuple[Dict[str, Any], float]], List[Dict[str, Any]]]:
        passed, rejected = self._reject_domain_conflict(candidates, profile)
        candidates = passed
        passed = []

        min_year = profile.research_constraints.minimum_year

        for cand, score in candidates:
            cand_year = cand.get("year")
            # If user explicitly specified minimum publication year as a hard constraint
            if min_year is not None and cand_year is not None:
                if int(cand_year) < int(min_year):
                    # Flag as not passing primary hard year constraint (can be shown in foundational if requested)
                    cand["rejection_reason"] = f"Published in {cand_year}, before required minimum year {min_year}"
                    rejected.append(cand)
                    continue

            passed.append((cand, score))

        return passed, rejected
